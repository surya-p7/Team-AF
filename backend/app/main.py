

import os
import uuid
import json
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any
from dotenv import load_dotenv


# ADK Imports
from google.adk.runners import InMemoryRunner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.genai.types import Content, Part

# Agent Import
from app.agent.agent import root_agent
import google.generativeai as genai
from google.generativeai.types import GenerationConfig

# Load environment variables
load_dotenv()

# Configure the Gemini API key
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

app = FastAPI(
    title="DeaLynx Backend",
    description="API for the DeaLynx Chrome Extension",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for sessions
sessions: Dict[str, Dict[str, Any]] = {}
APP_NAME = "DeaLynx"

# Pydantic Models
class SessionStartRequest(BaseModel):
    client: str
    started_at: str
    product_description: str

class Session(BaseModel):
    session_id: str

class Capture(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    capture_id: str = Field(..., alias='id')
    captured_at: str = Field(..., alias='capturedAt')
    url: str
    title: str
    headings: List[str]
    description: str
    primary_heading: str = Field(..., alias='primaryHeading')
    secondary_heading: str = Field(..., alias='secondaryHeading')
    keywords: List[str]
    highlights: List[str]
    sentiment: str
    raw_text: str = Field(..., alias='rawText')
    dom_snapshot: str = Field(..., alias='domSnapshot')

# Agent Session Management for Chat
async def start_agent_session(session_id: str):
    """Starts an agent session for chat."""
    runner = InMemoryRunner(app_name=APP_NAME, agent=root_agent)
    adk_session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=session_id
    )
    run_config = RunConfig(response_modalities=["TEXT"])
    live_request_queue = LiveRequestQueue()
    live_events = runner.run_live(
        session=adk_session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    return live_events, live_request_queue

async def agent_to_client_messaging(websocket: WebSocket, live_events):
    """Streams messages from the agent to the client."""
    async for event in live_events:
        if event.turn_complete or event.interrupted:
            message = {
                "turn_complete": event.turn_complete,
                "interrupted": event.interrupted,
            }
            await websocket.send_text(json.dumps(message))
            continue

        part: Part = event.content and event.content.parts and event.content.parts[0]
        if not part or not part.text:
            continue

        message = {"mime_type": "text/plain", "data": part.text}
        await websocket.send_text(json.dumps(message))

async def client_to_agent_messaging(websocket: WebSocket, live_request_queue: LiveRequestQueue, session_id: str):
    """Sends messages from the client to the agent."""
    session_data = sessions.get(session_id, {})
    product_description = session_data.get("product_description", "No product description provided.")
    captures = session_data.get("captures", [])
    
    capture_summary = "\n".join([f"- {c.get('title')} ({c.get('url')})" for c in captures])
    context_prompt = f"""
    You are DeaLynx, a helpful sales intelligence assistant. Answer the user's question based on the provided context. Keep your answers concise and conversational.

    **Product Context:**
    {product_description}

    **Summary of Captured Pages:**
    {capture_summary}
    """
    initial_content = Content(role="user", parts=[Part.from_text(text=context_prompt)])
    live_request_queue.send_content(content=initial_content)

    while True:
        message_json = await websocket.receive_text()
        message = json.loads(message_json)
        content = Content(role="user", parts=[Part.from_text(text=message.get("data"))])
        live_request_queue.send_content(content=content)

# API Endpoints
@app.post("/api/sessions", response_model=Session, status_code=201)
async def create_session(request: SessionStartRequest):
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "product_description": request.product_description,
        "started_at": request.started_at,
        "captures": [],
        "report": None
    }
    return Session(session_id=session_id)


class Profile(BaseModel):
    name: str
    role: str
    company: str
    summary: str
    location: str

class KPI(BaseModel):
    label: str
    value: int
    unit: str
    description: str

class KeyDecisionFactors(BaseModel):
    title: str
    items: List[str]

class InterestBreakdownItem(BaseModel):
    label: str
    value: float

class Charts(BaseModel):
    interestBreakdown: List[InterestBreakdownItem]

class Report(BaseModel):
    profile: Profile
    kpis: List[KPI]
    keyDecisionFactors: KeyDecisionFactors
    charts: Charts

@app.post("/api/sessions/{session_id}/analyze", status_code=200)
async def analyze_captures(session_id: str, captures: List[Capture]):
    """Analyzes captures and returns a structured report using the google-generativeai library."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = sessions[session_id]
    product_description = session_data.get("product_description")
    dom_content = "\n\n".join([f"--- Capture from {c.url} ---\n{c.dom_snapshot}" for c in captures])
    
    prompt = f"""
    As a world-class sales intelligence analyst, your task is to generate a structured JSON report based on the provided product description and the HTML DOM content captured from various web pages related to a sales prospect.
    **Product Description:** {product_description}
    **Captured DOM Content:** {dom_content}
    **Your Task:** Analyze the provided information and generate a single, valid JSON object. Do not include any text or formatting outside of the JSON object.
    """

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        generation_config = GenerationConfig(
            response_mime_type="application/json",
            response_schema=Report
        )
        response = await model.generate_content_async(prompt, generation_config=generation_config)
        
        report_data = json.loads(response.text)
        session_data["report"] = report_data
        return report_data

    except Exception as e:
        print(f"Error generating report with google-generativeai: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate AI report: {str(e)}")

@app.get("/api/available-models")
async def get_available_models():
    """Returns a list of available Gemini models."""
    try:
        model_list = litellm.model_list
        gemini_models = [model for model in model_list if "gemini" in model]
        return {"available_gemini_models": gemini_models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve model list: {str(e)}")


@app.websocket("/ws/sessions/{session_id}/chat")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """Handles the chat WebSocket connection with the ADK Agent."""
    await websocket.accept()
    if session_id not in sessions:
        await websocket.close(code=1008, reason="Session not found")
        return

    try:
        live_events, live_request_queue = await start_agent_session(session_id)
        
        agent_to_client_task = asyncio.create_task(
            agent_to_client_messaging(websocket, live_events)
        )
        client_to_agent_task = asyncio.create_task(
            client_to_agent_messaging(websocket, live_request_queue, session_id)
        )

        await asyncio.wait(
            [agent_to_client_task, client_to_agent_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        print(f"WebSocket connection closed for session {session_id}")

@app.get("/")
async def root():
    return {"message": "DeaLynx backend is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
