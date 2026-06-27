import os
import uuid
import shutil
import time
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pdf_processor import PDFProcessor
from ai_handler import AIHandler
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI PDF Editor Backend")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sessions directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_DIR = os.path.join(BASE_DIR, "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    sessionId: str
    message: str
    history: List[Dict[str, str]] = []

class EditPlanRequest(BaseModel):
    sessionId: str
    instruction: str

class ApplyEditsRequest(BaseModel):
    sessionId: str
    replacements: List[Dict[str, Any]] = []
    pageOperations: List[Dict[str, Any]] = []

class ExportRequest(BaseModel):
    sessionId: str
    format: str  # pdf, docx, pptx, xlsx, txt, images
    compression: Optional[bool] = False
    watermark: Optional[str] = None
    password: Optional[str] = None

# Background task to clean up old sessions
def cleanup_old_sessions():
    now = time.time()
    # Deletes sessions older than 30 minutes (1800 seconds)
    expiry_time = 1800
    if os.path.exists(SESSIONS_DIR):
        for session_name in os.listdir(SESSIONS_DIR):
            session_path = os.path.join(SESSIONS_DIR, session_name)
            if os.path.isdir(session_path):
                # Check modification time of session folder
                mtime = os.path.getmtime(session_path)
                if now - mtime > expiry_time:
                    try:
                        shutil.rmtree(session_path)
                        print(f"Expired session cleaned up: {session_name}")
                    except Exception as e:
                        print(f"Error cleaning expired session {session_name}: {e}")

@app.middleware("http")
async def db_session_middleware(request, call_next):
    # Perform cleanup check on requests (lazy cleanup)
    cleanup_old_sessions()
    response = await call_next(request)
    return response

def get_session_dir(session_id: str) -> str:
    """Helper to get and create a session folder safely."""
    # Prevent directory traversal attacks
    safe_id = "".join([c for c in session_id if c.isalnum() or c == "-"])
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid Session ID")
    path = os.path.join(SESSIONS_DIR, safe_id)
    os.makedirs(path, exist_ok=True)
    # Update directory modification time to keep session alive
    os.utime(path, None)
    return path

@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    password: Optional[str] = Form(None)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    session_path = get_session_dir(sessionId)
    pdf_path = os.path.join(session_path, "document.pdf")
    
    # Save the file
    with open(pdf_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    try:
        # Check password and try to decrypt
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            if password:
                decrypted = doc.authenticate(password)
                if not decrypted:
                    doc.close()
                    raise HTTPException(status_code=401, detail="Incorrect password for PDF.")
            else:
                doc.close()
                return JSONResponse(
                    status_code=401, 
                    content={"detail": "Password required", "isEncrypted": True}
                )
        doc.close()
        
        # Extract initial layout and text
        metadata = PDFProcessor.get_metadata(pdf_path)
        detailed_text = PDFProcessor.extract_detailed_text(pdf_path)
        
        return {
            "success": True,
            "metadata": metadata,
            "detailedText": detailed_text
        }
    except HTTPException:
        raise
    except Exception as e:
        # Cleanup file if failed
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

@app.post("/api/chat")
async def chat(request: ChatRequest, x_gemini_api_key: Optional[str] = Header(None)):
    session_path = get_session_dir(request.sessionId)
    pdf_path = os.path.join(session_path, "document.pdf")
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="No document uploaded for this session.")
        
    try:
        doc_text = PDFProcessor.extract_text_by_page(pdf_path)
        ai = AIHandler(api_key=x_gemini_api_key)
        response = ai.chat_about_document(doc_text, request.message, request.history)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/plan-edits")
async def plan_edits(request: EditPlanRequest, x_gemini_api_key: Optional[str] = Header(None)):
    session_path = get_session_dir(request.sessionId)
    pdf_path = os.path.join(session_path, "document.pdf")
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="No document uploaded for this session.")
        
    try:
        doc_text = PDFProcessor.extract_text_by_page(pdf_path)
        ai = AIHandler(api_key=x_gemini_api_key)
        if not ai.is_configured():
            return {"success": False, "error": "Gemini API key is missing. Add your API key in settings."}
            
        plans = ai.plan_pdf_edits(doc_text, request.instruction)
        return {"success": True, "plans": plans}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/apply-edits")
async def apply_edits(request: ApplyEditsRequest):
    session_path = get_session_dir(request.sessionId)
    pdf_path = os.path.join(session_path, "document.pdf")
    temp_path = os.path.join(session_path, "document_temp.pdf")
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="No document found.")
        
    try:
        # Apply structural page operations if any
        if request.pageOperations:
            PDFProcessor.execute_page_operations(pdf_path, request.pageOperations, temp_path)
            shutil.move(temp_path, pdf_path)
            
        # Apply search and replace text operations if any
        if request.replacements:
            PDFProcessor.replace_text(pdf_path, request.replacements, temp_path)
            shutil.move(temp_path, pdf_path)
            
        # Extract the new detailed text positions
        detailed_text = PDFProcessor.extract_detailed_text(pdf_path)
        metadata = PDFProcessor.get_metadata(pdf_path)
        
        return {
            "success": True,
            "metadata": metadata,
            "detailedText": detailed_text
        }
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to apply edits: {str(e)}")

@app.post("/api/export")
async def export_document(
    request: ExportRequest, 
    background_tasks: BackgroundTasks
):
    session_path = get_session_dir(request.sessionId)
    pdf_path = os.path.join(session_path, "document.pdf")
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="No document found.")
        
    export_format = request.format.lower()
    export_filename = f"exported_document.{export_format}"
    export_path = os.path.join(session_path, export_filename)
    
    try:
        # Step 1: Handle PDF configurations (watermark, password, compress)
        if export_format == "pdf":
            working_pdf = pdf_path
            
            # Apply watermark
            if request.watermark:
                watermark_pdf = os.path.join(session_path, "document_watermark.pdf")
                PDFProcessor.add_watermark(working_pdf, request.watermark, watermark_pdf)
                working_pdf = watermark_pdf
                
            # Apply compression
            if request.compression:
                compressed_pdf = os.path.join(session_path, "document_compressed.pdf")
                PDFProcessor.compress_pdf(working_pdf, compressed_pdf)
                working_pdf = compressed_pdf
                
            # Apply password protection
            if request.password:
                final_pdf = os.path.join(session_path, "document_secured.pdf")
                doc = fitz.open(working_pdf)
                # Save with encryption
                doc.save(
                    final_pdf, 
                    encryption=fitz.PDF_ENCRYPT_AES_256, 
                    user_pw=request.password, 
                    owner_pw=str(uuid.uuid4())
                )
                doc.close()
                working_pdf = final_pdf
                
            # If any of the modifiers ran, copy it to the export path. Else copy the original
            shutil.copy2(working_pdf, export_path)
            
        elif export_format == "docx":
            PDFProcessor.export_to_docx(pdf_path, export_path)
            
        elif export_format == "pptx":
            PDFProcessor.export_to_pptx(pdf_path, export_path)
            
        elif export_format in ["xlsx", "xls"]:
            export_path = os.path.join(session_path, "exported_tables.xlsx")
            PDFProcessor.export_to_excel(pdf_path, export_path)
            
        elif export_format in ["txt", "text"]:
            export_path = os.path.join(session_path, "extracted_text.txt")
            doc_text = PDFProcessor.extract_text_by_page(pdf_path)
            with open(export_path, "w", encoding="utf-8") as f:
                for p in doc_text:
                    f.write(f"--- Page {p['page']} ---\n")
                    f.write(p["text"])
                    f.write("\n\n")
                    
        elif export_format in ["md", "markdown"]:
            export_path = os.path.join(session_path, "extracted_text.md")
            doc_text = PDFProcessor.extract_text_by_page(pdf_path)
            with open(export_path, "w", encoding="utf-8") as f:
                f.write("# PDF Document Export\n\n")
                for p in doc_text:
                    f.write(f"## Page {p['page']}\n\n")
                    f.write(p["text"])
                    f.write("\n\n")
                    
        elif export_format == "images":
            images_dir = os.path.join(session_path, "images")
            PDFProcessor.extract_images(pdf_path, images_dir)
            # Create a zip of the images
            zip_path = os.path.join(session_path, "images_export")
            shutil.make_archive(zip_path, 'zip', images_dir)
            export_path = zip_path + ".zip"
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported export format: {export_format}")
            
        if not os.path.exists(export_path):
            raise HTTPException(status_code=500, detail="Export file generation failed.")
            
        # Add background task to delete the whole session directory shortly after download.
        # This enforces the "No stored files" privacy requirement.
        def purge_session(s_id: str):
            # Wait 10 seconds before deleting to let the download stream finish
            time.sleep(10)
            try:
                s_path = os.path.join(SESSIONS_DIR, s_id)
                if os.path.exists(s_path):
                    shutil.rmtree(s_path)
                    print(f"Session {s_id} purged after download.")
            except Exception as e:
                print(f"Error purging session {s_id}: {e}")
                
        background_tasks.add_task(purge_session, request.sessionId)
        
        return FileResponse(
            path=export_path,
            filename=os.path.basename(export_path),
            media_type="application/octet-stream"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@app.post("/api/cleanup")
async def cleanup_session(payload: Dict[str, str]):
    sessionId = payload.get("sessionId")
    if not sessionId:
        raise HTTPException(status_code=400, detail="Missing Session ID")
    session_path = os.path.join(SESSIONS_DIR, sessionId)
    if os.path.exists(session_path):
        try:
            shutil.rmtree(session_path)
            return {"success": True, "message": f"Session {sessionId} deleted successfully."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")
    return {"success": True, "message": "Session already deleted or not found."}
