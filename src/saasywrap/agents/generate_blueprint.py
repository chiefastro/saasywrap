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

There are four specialized transform types that handle different aspects of the system:
1. schema: Generates database tables and relationships
2. form: Creates UI components (HTML, CSS, Javascript) for CRUD operations on schema elements
3. view: Builds detailed views of single instances that may span multiple database tables
4. dashboard: Produces aggregate views of multiple instances

Your response must be a JSON object with two fields:
1. "response": A natural language response explaining the blueprint
2. "blueprint": An array of transform objects

Example format:
{{
    "response": "I've broken down the implementation into 5 transforms, starting with the database schema...",
    "blueprint": [
        {{
            "id": "transform-1",
            "title": "Generate User Table Schema",
            "description": "Create the initial database schema for user management",
            "status": "pending",
            "estimated_time": "10 minutes",
            "dependencies": [],
            "requirement_ids": ["req-123", "req-456"],
            "transform_type": "schema"
        }}
    ]
}}

Each transform must have:
1. id: Unique identifier
2. title: Clear, action-oriented title
3. description: Detailed description of what will be done
4. status: One of: pending, in_progress, completed, failed, rolled_back
5. estimated_time: Estimated time to complete
6. dependencies: Array of transform IDs that must be completed first
7. requirement_ids: Array of requirement IDs that this transform implements
8. transform_type: One of: schema, form, view, dashboard (determines which specialized agent will handle execution)

When assigning requirements to transforms:
- Each requirement should be implemented by at least one transform
- A transform can implement multiple requirements
- Requirements should be grouped logically (e.g., related database tables in one schema transform)
- Form transforms should typically follow schema transforms they depend on
- View transforms can combine data from multiple schemas
- Dashboard transforms typically come last as they often depend on other transforms"""

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
Transform Type: {transform['transform_type']}
Requirements:
{self._format_transform_requirements(transform['requirement_ids'])}

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
                       chat_history: List[Dict], preview_state: Dict,
                       requirements: List[Dict] = None) -> Dict:
        """Process a chat message and update blueprint if needed."""
        # Work with a copy of the current blueprint
        self.blueprint = current_blueprint.copy()
        self.conversation_history = chat_history
        
        prompt = f"""Given the current blueprint:
{self._format_blueprint()}

And the current requirements:
{self._format_requirements(requirements) if requirements else "No requirements provided"}

And the conversation history:
{self._format_conversation_history()}

The user's message: "{message}"

You must respond with a JSON object containing two fields:
1. "response": Your natural language response to the user
2. "changes": An array of blueprint changes (can be empty if no changes needed)

Example format:
{{
    "response": "I understand you want to add a new transform for user authentication. I'll add that now.",
    "changes": [
        {{
            "type": "add",
            "transform": {{
                "id": "transform-new",
                "title": "Implement User Authentication",
                "description": "Add secure authentication system",
                "status": "pending",
                "type": "schema",
                "estimated_time": "30 minutes",
                "dependencies": [],
                "requirement_ids": ["req-123"],
                "transform_type": "schema"
            }}
        }},
        {{
            "type": "modify",
            "id": "existing-transform-id",
            "updates": {{
                "title": "Updated Title",
                "description": "Updated description",
                "requirement_ids": ["req-123", "req-456"]
            }}
        }},
        {{
            "type": "remove",
            "id": "transform-to-remove"
        }}
    ]
}}

Each change must be one of:
1. add: Include a complete new transform object
2. modify: Specify transform ID and fields to update
3. remove: Specify transform ID to remove"""

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
            
            # Return just the response and changes, let frontend handle the updates
            return {
                'response': data['response'],
                'changes': data.get('changes', [])
            }
        except Exception as e:
            print(f"Error processing message: {str(e)}")
            return {
                'response': 'Sorry, there was an error processing your message.',
                'changes': []
            }

    def _format_requirements(self, requirements: List[Dict]) -> str:
        """Format requirements for prompts."""
        return "\n".join([
            f"- {req['title']} (ID: {req['id']}): {req['description']}"
            for req in requirements
        ])
        
    def _format_transform_requirements(self, requirement_ids: List[str]) -> str:
        """Format transform requirements for prompts."""
        requirements = []
        for req_id in requirement_ids:
            req = next((r for r in self.requirements if r['id'] == req_id), None)
            if req:
                requirements.append(f"- {req['title']} (ID: {req['id']}): {req['description']}")
        return "\n".join(requirements)
        
    def _format_blueprint(self) -> str:
        """Format current blueprint for prompts."""
        return "\n".join([
            f"Transform {i+1}: {transform['title']} ({transform['status']}, Type: {transform['transform_type']}, Requirements: {', '.join(transform['requirement_ids'])})"
            for i, transform in enumerate(self.blueprint)
        ])
        
    def _format_conversation_history(self) -> str:
        """Format conversation history for prompts."""
        return "\n".join([
            f"{msg['role'].title()}: {msg['content']}"
            for msg in self.conversation_history
        ])
