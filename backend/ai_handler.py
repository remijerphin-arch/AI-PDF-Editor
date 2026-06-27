import os
import json
import google.generativeai as genai
from typing import List, Dict, Any, Optional

class AIHandler:
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the Gemini API client.
        Prioritizes the passed api_key, then falls back to GEMINI_API_KEY env variable.
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def chat_about_document(self, doc_text_by_page: List[Dict[str, Any]], user_query: str, chat_history: List[Dict[str, str]] = None) -> str:
        """
        Answer questions about the document based on its extracted text.
        """
        if not self.is_configured():
            return "Gemini API key is not configured. Please provide your API key in the settings to chat with the document."

        # Compile document text for context
        context_parts = []
        context_parts.append("Below is the content of the PDF document uploaded by the user:")
        for p in doc_text_by_page[:150]:  # Limit to first 150 pages to stay within token limits
            context_parts.append(f"--- Page {p['page']} ---\n{p['text']}\n")
        
        context_str = "\n".join(context_parts)
        
        system_instruction = (
            "You are an AI document assistant in a premium, privacy-first PDF editor. "
            "Your task is to answer the user's questions about the document accurately and concisely, "
            "based strictly on the provided document text. If the answer cannot be found in the document, "
            "state that clearly. Do not make up information. Use beautiful Markdown formatting in your replies."
        )
        
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=system_instruction
        )
        
        # Build prompt history
        contents = []
        if chat_history:
            for message in chat_history:
                role = "user" if message["role"] == "user" else "model"
                contents.append({"role": role, "parts": [message["content"]]})
                
        # Append context + user query
        full_query = f"{context_str}\n\nUser Question: {user_query}"
        contents.append({"role": "user", "parts": [full_query]})
        
        response = model.generate_content(contents)
        return response.text

    def plan_pdf_edits(self, doc_text_by_page: List[Dict[str, Any]], instruction: str) -> List[Dict[str, Any]]:
        """
        Plan edits on the PDF text based on natural language instructions.
        Returns a list of replacements: [{"page": int, "find": str, "replace": str, "explanation": str}]
        """
        if not self.is_configured():
            return []

        # Compile document text for context
        doc_summary = []
        for p in doc_text_by_page[:50]:  # Limit to 50 pages for precise edit operations
            doc_summary.append(f"Page {p['page']}:\n{p['text']}\n")
        doc_context = "\n".join(doc_summary)

        prompt = f"""
You are an expert PDF editor planner. The user wants to edit their PDF using this instruction:
"{instruction}"

Below is the text content of the PDF document:
{doc_context}

Your task is to plan exact search-and-replace text modifications to fulfill the user's request.
Return your plan strictly as a JSON list of objects. Each object MUST have:
1. "page": (integer) The page number (1-indexed) where the replacement occurs.
2. "find": (string) The exact sequence of characters/words to find in the PDF. This must match the document text EXACTLY, including punctuation and spaces. Keep search strings relatively short (1 to 6 words) for reliability.
3. "replace": (string) The new text to put in its place.
4. "explanation": (string) A very brief sentence explaining why this change is made.

Important rules:
- If the instruction is to "change every date to today's date" or "replace company names", you must find all matches across all pages and list them individually.
- If there are grammar or spelling mistakes, locate the exact sentence/fragment and replace it.
- Keep the "find" text exactly as it appears in the PDF. Do not summarize it.
- Do NOT output any conversational text or markdown formatting (like ```json). Return ONLY raw JSON array.
- If the request cannot be fulfilled by text search-and-replace (e.g. "delete page 3", "rotate PDF", "add signature"), return an empty list `[]` (these structural operations are handled separately).

Example output format:
[
  {{"page": 1, "find": "July 15, 2023", "replace": "June 27, 2026", "explanation": "Updated date to today's date"}},
  {{"page": 2, "find": "the company A will", "replace": "Company B will", "explanation": "Replaced company name"}}
]
"""
        model = genai.GenerativeModel(model_name="gemini-1.5-flash")
        
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            )
        )
        
        try:
            # Parse the JSON response
            edits = json.loads(response.text.strip())
            return edits
        except Exception as e:
            print("Error parsing LLM edit response:", e)
            print("Response raw text:", response.text)
            return []
