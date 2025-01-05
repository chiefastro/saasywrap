import openai
from typing import List, Dict, Any, Optional
import os
from datetime import datetime

class PlanAgent:
    def __init__(self):
        self.plans = []
        self.conversation_history = []
        self.client = openai.OpenAI()
        self.preview_state = {}
        
    def generate_initial_plan(self, requirements: List[Dict]) -> List[Dict]:
        """Generate initial plan steps from requirements."""
        prompt = f"""Given these requirements for a SaaS application:
{self._format_requirements(requirements)}

Generate a step-by-step plan to implement these requirements. Each step should be atomic and independently executable.

Your response must be a JSON object with two fields:
1. "response": A natural language response explaining the plan
2. "plans": An array of plan step objects

Example format:
{{
    "response": "I've broken down the implementation into 5 steps, starting with the database schema...",
    "plans": [
        {{
            "id": "step-1",
            "title": "Generate Database Schema",
            "description": "Create the initial database schema based on the requirements",
            "status": "pending",
            "type": "database",
            "estimated_time": "10 minutes",
            "dependencies": []
        }}
    ]
}}

Each plan step must have:
1. id: Unique identifier
2. title: Clear, action-oriented title
3. description: Detailed description of what will be done
4. status: One of: pending, in_progress, completed, failed, rolled_back
5. type: One of: database, backend, frontend, infrastructure
6. estimated_time: Estimated time to complete
7. dependencies: Array of step IDs that must be completed first"""

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
            self.plans = data['plans']
            return {
                'plans': self.plans,
                'response': data['response']
            }
        except Exception as e:
            print(f"Error generating plan: {str(e)}")
            return {
                'plans': [],
                'response': "Sorry, there was an error generating the plan. Please try again."
            }

    def execute_step(self, step_id: str, preview_state: Dict) -> Dict:
        """Execute a specific plan step."""
        step = next((s for s in self.plans if s['id'] == step_id), None)
        if not step:
            return {
                'status': 'failed',
                'message': 'Step not found',
                'preview': None
            }
            
        # Update step status
        step['status'] = 'in_progress'
        
        prompt = f"""Execute the following plan step:
Title: {step['title']}
Description: {step['description']}
Type: {step['type']}

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
    "message": "Step completed successfully",
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
            print(f"Error executing step: {str(e)}")
            return {
                'status': 'failed',
                'message': 'Error executing step',
                'preview': None
            }

    def process_message(self, message: str, current_plans: List[Dict], 
                       chat_history: List[Dict], preview_state: Dict) -> Dict:
        """Process a chat message and update plans if needed."""
        self.plans = current_plans
        self.conversation_history = chat_history
        self.preview_state = preview_state
        
        prompt = f"""Given the current plan:
{self._format_plans()}

And the conversation history:
{self._format_conversation_history()}

The user's message: "{message}"

Generate a response with:
1. Message to the user
2. Updated plans (if needed)
3. Updated preview (if needed)

Response format:
{{
    "response": "I understand you want to modify step 2...",
    "plans": [...],
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
                'plans': self.plans,
                'preview': None
            }

    def _format_requirements(self, requirements: List[Dict]) -> str:
        """Format requirements for prompts."""
        return "\n".join([
            f"- {req['title']}: {req['description']}"
            for req in requirements
        ])
        
    def _format_plans(self) -> str:
        """Format current plans for prompts."""
        return "\n".join([
            f"Step {i+1}: {plan['title']} ({plan['status']})"
            for i, plan in enumerate(self.plans)
        ])
        
    def _format_conversation_history(self) -> str:
        """Format conversation history for prompts."""
        return "\n".join([
            f"{msg['role'].title()}: {msg['content']}"
            for msg in self.conversation_history
        ])
