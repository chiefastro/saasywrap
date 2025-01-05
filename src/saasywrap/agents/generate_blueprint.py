import openai
from typing import List, Dict, Any, Optional
import os
from datetime import datetime

class BlueprintAgent:
    def __init__(self):
        self.blueprint = []
        self.conversation_history = []
        self.client = openai.OpenAI()
        self.preview_state = {}
        
    def generate_initial_blueprint(self, requirements: List[Dict]) -> List[Dict]:
        """Generate initial transforms from requirements."""
        prompt = f"""Given these requirements for a SaaS application:
{self._format_requirements(requirements)}

Generate a step-by-step blueprint to implement these requirements. Each transform should be atomic and independently executable.

Your response must be a JSON object with two fields:
1. "response": A natural language response explaining the blueprint
2. "blueprint": An array of transform objects

Example format:
{{
    "response": "I've broken down the implementation into 5 transforms, starting with the database schema...",
    "blueprint": [
        {{
            "id": "transform-1",
            "title": "Generate Database Schema",
            "description": "Create the initial database schema based on the requirements",
            "status": "pending",
            "type": "database",
            "estimated_time": "10 minutes",
            "dependencies": []
        }}
    ]
}}

Each transform must have:
1. id: Unique identifier
2. title: Clear, action-oriented title
3. description: Detailed description of what will be done
4. status: One of: pending, in_progress, completed, failed, rolled_back
5. type: One of: database, backend, frontend, infrastructure
6. estimated_time: Estimated time to complete
7. dependencies: Array of transform IDs that must be completed first"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a technical planning assistant. You must respond with valid JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_object"
            }
        )
        
        try:
            import json
            data = json.loads(response.choices[0].message.content)
            self.blueprint = data['blueprint']
            return {
                'blueprint': self.blueprint,
                'response': data['response']
            }
        except Exception as e:
            print(f"Error generating blueprint: {str(e)}")
            return {
                'blueprint': [],
                'response': "Sorry, there was an error generating the blueprint. Please try again."
            }

    def execute_transform(self, transform_id: str, preview_state: Dict) -> Dict:
        """Execute a specific transform."""
        transform = next((t for t in self.blueprint if t['id'] == transform_id), None)
        if not transform:
            return {
                'status': 'failed',
                'message': 'Transform not found',
                'preview': None
            }
            
        # Update transform status
        transform['status'] = 'in_progress'
        
        prompt = f"""Execute the following transform:
Title: {transform['title']}
Description: {transform['description']}
Type: {transform['type']}

Current preview state:
{preview_state}

Generate a response with:
1. Updated preview HTML
2. Status of the execution
3. Message to display to the user

Response format:
{{
    "preview": "<div>Updated preview HTML</div>",
    "status": "completed",
    "message": "Transform completed successfully",
    "preview_state": {{
        "updated": "state"
    }}
}}"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a technical implementation assistant. You must respond with valid JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_object"
            }
        )
        
        try:
            import json
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Error executing transform: {str(e)}")
            return {
                'status': 'failed',
                'message': 'Error executing transform',
                'preview': None
            }

    def process_message(self, message: str, current_blueprint: List[Dict], 
                       chat_history: List[Dict], preview_state: Dict) -> Dict:
        """Process a chat message and update blueprint if needed."""
        self.blueprint = current_blueprint
        self.conversation_history = chat_history
        self.preview_state = preview_state
        
        prompt = f"""Given the current blueprint:
{self._format_blueprint()}

And the conversation history:
{self._format_conversation_history()}

The user's message: "{message}"

Generate a response with:
1. Message to the user
2. Updated blueprint (if needed)
3. Updated preview (if needed)

Response format:
{{
    "response": "I understand you want to modify transform 2...",
    "blueprint": [...],
    "preview": "<div>Updated preview</div>"
}}"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a technical planning assistant. You must respond with valid JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_object"
            }
        )
        
        try:
            import json
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Error processing message: {str(e)}")
            return {
                'response': 'Sorry, there was an error processing your message.',
                'blueprint': self.blueprint,
                'preview': None
            }

    def _format_requirements(self, requirements: List[Dict]) -> str:
        """Format requirements for prompts."""
        return "\n".join([
            f"- {req['title']}: {req['description']}"
            for req in requirements
        ])
        
    def _format_blueprint(self) -> str:
        """Format current blueprint for prompts."""
        return "\n".join([
            f"Transform {i+1}: {transform['title']} ({transform['status']})"
            for i, transform in enumerate(self.blueprint)
        ])
        
    def _format_conversation_history(self) -> str:
        """Format conversation history for prompts."""
        return "\n".join([
            f"{msg['role'].title()}: {msg['content']}"
            for msg in self.conversation_history
        ])
