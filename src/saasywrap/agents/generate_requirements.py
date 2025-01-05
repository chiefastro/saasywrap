import openai
import pandas as pd
from typing import List, Optional, Dict, Any
import os

class RequirementsAgent:
    def __init__(self):
        self.requirements = []
        self.conversation_history = []
        self.dataset_info = None
        self.client = openai.OpenAI()
        self.initial_response = None
        
    def parse_dataset(self, dataset_path: str) -> None:
        """Parse a dataset file and update the dataset_info attribute."""
        if not dataset_path or not os.path.exists(dataset_path):
            self.dataset_info = None
            return
            
        # if csv, read single df
        if dataset_path.endswith('.csv'):
            dfs = {"data": pd.read_csv(dataset_path)}
        # if excel, read all sheets
        elif dataset_path.endswith('.xlsx') or dataset_path.endswith('.xls'):
            dfs = {}
            for sheet_name in pd.ExcelFile(dataset_path).sheet_names:
                dfs[sheet_name] = pd.read_excel(dataset_path, sheet_name=sheet_name)
        else:
            raise ValueError("Unsupported file type. Please provide a CSV or Excel file.")
        
        self.dataset_info = {}
        for sheet_name, df in dfs.items():
            self.dataset_info[sheet_name] = {
                'columns': list(df.columns),
                'sample_rows': df.head(5).to_dict('records'),
                'total_rows': len(df)
            }
            
    def get_initial_response(self) -> str:
        """Return the stored initial response."""
        return self.initial_response or "I've analyzed your requirements and created structured requirements based on them. You can view them in the panel on the right."
            
    def generate_initial_requirements(self, initial_description: str, dataset_path: Optional[str] = None, n_choices: int = 3) -> List[Dict]:
        """Generate initial requirements from user description and dataset."""
        # Parse dataset if provided
        if dataset_path:
            self.parse_dataset(dataset_path)
        
        prompt = f"""Given the following description of a SaaS application:
{initial_description}

{"And the following dataset structure:" if self.dataset_info else ""}
{self._format_dataset_info() if self.dataset_info else ""}

Generate requirements for the application and provide a natural language response explaining your analysis.
Your response must be a JSON object with two fields:
1. "response": A natural language response that:
   - Acknowledges the user's requirements
   - Explains what you've created
   - Highlights key patterns or themes identified
   - Provides guidance on next steps
   - Asks a follow up question to initiate a dialogue with the user
2. "requirements": An array of requirement objects

Example format:
{{
    "response": "I've analyzed your requirements for a project management system. I've broken this down into 8 core requirements, focusing on user management, task tracking, and reporting features. I notice a strong emphasis on team collaboration and data visualization. Take a look at the requirements in the right panel. Let's work together to refine these requirements. What would you like to add next?",
    "requirements": [
        {{
            "title": "User Authentication System",
            "description": "Implement secure user authentication with email and password, including password reset functionality",
            "importance": "high",
            "category": "backend",
            "tags": ["security", "user-management", "authentication"]
        }},
        {{
            "title": "Responsive Dashboard UI",
            "description": "Create a mobile-friendly dashboard that displays key metrics and data visualizations",
            "importance": "medium",
            "category": "frontend",
            "tags": ["ui", "dashboard", "responsive"]
        }}
    ]
}}

Guidelines for each requirement:
1. title: Brief but specific, action-oriented
2. description: Detailed, testable, and from a user's perspective
3. importance: Must be exactly one of: "high", "medium", "low"
4. category: Must be exactly one of: "frontend", "backend", "database", "feature", "security", "performance", "ux", "other"
5. tags: Array of relevant features, technologies, or themes

IMPORTANT: Your response must be a valid JSON object with both 'response' and 'requirements' fields.
Each requirement must be independent and focused on a single feature or constraint."""

        # Call OpenAI to generate requirements
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a requirements analysis assistant helping users structure their application requirements. You must respond with valid JSON only, no additional text."
            },
            {
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_object"
            },
            n=n_choices
        )
        
        # Try each choice until we find a valid one
        for choice in response.choices:
            try:
                # Parse JSON response
                import json
                response_text = choice.message.content.strip()
                
                # Debug logging
                print(f"Trying choice: {response_text}")
                
                data = json.loads(response_text)
                
                # Check for required fields
                if not isinstance(data, dict) or 'response' not in data or 'requirements' not in data:
                    print(f"Invalid response structure in choice {choice.index}, trying next choice...")
                    continue
                
                if not isinstance(data['requirements'], list):
                    print(f"Requirements must be an array in choice {choice.index}, trying next choice...")
                    continue
                    
                # Validate each requirement
                valid_requirements = []
                all_valid = True
                
                for req in data['requirements']:
                    if self._validate_requirement(req):
                        requirement = {
                            'id': self._generate_id(),
                            'title': req['title'],
                            'description': req['description'],
                            'importance': req['importance'],
                            'category': req['category'],
                            'tags': req['tags'],
                            'dateAdded': self._get_current_timestamp(),
                            'dateModified': self._get_current_timestamp(),
                            'createdBy': 'ai-agent',
                            'changeHistory': [{
                                'type': 'created',
                                'timestamp': self._get_current_timestamp(),
                                'userId': 'ai-agent',
                                'details': 'Requirement generated from initial description'
                            }]
                        }
                        valid_requirements.append(requirement)
                    else:
                        all_valid = False
                        break
                
                if all_valid and valid_requirements:
                    print(f"Found valid response in choice {choice.index}")
                    self.requirements = valid_requirements
                    self.initial_response = data['response']
                    return self.requirements
                else:
                    print(f"Invalid requirements in choice {choice.index}, trying next choice...")
                    
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON in choice {choice.index}: {str(e)}")
                continue
            except Exception as e:
                print(f"Unexpected error in choice {choice.index}: {str(e)}")
                continue
        
        # If we get here, none of the choices were valid
        print("No valid choices found")
        return []
            
    def _validate_requirement(self, req: Dict) -> bool:
        """Validate that a requirement has all required fields with correct values."""
        try:
            # Check all required fields exist
            required_fields = ['title', 'description', 'importance', 'category', 'tags']
            for field in required_fields:
                if field not in req:
                    print(f"Missing required field: {field}")
                    return False
            
            # Validate importance
            if req['importance'] not in ['high', 'medium', 'low']:
                print(f"Invalid importance value: {req['importance']}")
                return False
                
            # Validate categories
            valid_categories = ['frontend', 'backend', 'database', 'feature', 'security', 'performance', 'ux', 'general', 'other']
            if req['category'] not in valid_categories:
                print(f"Invalid category: {req['category']}")
                return False
                
            # Validate tags is a list
            if not isinstance(req['tags'], list):
                print("Tags must be an array")
                return False
                
            return True
        except Exception as e:
            print(f"Error validating requirement: {str(e)}")
            return False
        
    def _generate_id(self) -> str:
        """Generate a unique ID for a requirement."""
        import time
        import random
        return f'req-{int(time.time())}-{random.randint(1000, 9999)}'
        
    def _get_current_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.utcnow().isoformat()

    def process_message(self, message: str, n_choices: int = 3) -> str:
        """Process a chat message and update requirements if needed."""
        prompt = f"""Given the following conversation about application requirements:
{self._format_conversation_history()}

And the current set of requirements:
{self._format_requirements()}

{"And the dataset information:" if self.dataset_info else ""}
{self._format_dataset_info() if self.dataset_info else ""}

The user's message: "{message}"

You must respond with a JSON object containing two fields:
1. "response": Your natural language response to the user
2. "changes": An array of requirement changes (can be empty if no changes needed)

When breaking down requirements into more specific ones, you can use this format:
{{
    "type": "modify",
    "id": "existing-requirement-id",
    "updates": {{
        "category": "general",
        "sub_requirements": [
            {{
                "title": "More Specific Requirement 1",
                "description": "Detailed description",
                "importance": "high",
                "category": "backend",
                "tags": ["relevant", "tags"]
            }},
            {{
                "title": "More Specific Requirement 2",
                "description": "Detailed description",
                "importance": "medium",
                "category": "frontend",
                "tags": ["relevant", "tags"]
            }}
        ]
    }}
}}

Example format:
{{
    "response": "I understand you want to add user authentication. I'll add that as a requirement.",
    "changes": [
        {{
            "type": "add",
            "requirement": {{
                "title": "User Authentication",
                "description": "Implement secure login system",
                "importance": "high",
                "category": "backend",
                "tags": ["security", "auth"]
            }}
        }},
        {{
            "type": "modify",
            "id": "existing-id",
            "updates": {{
                "importance": "high",
                "category": "backend"
            }}
        }},
        {{
            "type": "remove",
            "id": "requirement-to-remove"
        }}
    ]
}}

IMPORTANT: Your entire response must be a valid JSON object with these exact fields."""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": "You are a requirements management assistant. You must respond with valid JSON only, no additional text."
            },
            {
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_object"
            },
            n=n_choices
        )
        
        # Try each choice until we find a valid one
        for choice in response.choices:
            try:
                # Parse JSON response
                import json
                response_text = choice.message.content.strip()
                
                # Debug logging
                print(f"Trying choice {choice.index}: {response_text}")
                
                data = json.loads(response_text)
                
                # Validate response structure
                if not isinstance(data, dict) or 'response' not in data or 'changes' not in data:
                    print(f"Invalid response structure in choice {choice.index}, trying next choice...")
                    continue

                # Process any sub-requirements in the changes
                processed_changes = []
                for change in data.get('changes', []):
                    if change['type'] == 'modify' and 'sub_requirements' in change.get('updates', {}):
                        # Mark the parent requirement as general
                        processed_changes.append({
                            'type': 'modify',
                            'id': change['id'],
                            'updates': {
                                'category': 'general',
                                'importance': change['updates'].get('importance', 'medium')
                            }
                        })
                        
                        # Create new requirements for each sub-requirement
                        for sub_req in change['updates']['sub_requirements']:
                            processed_changes.append({
                                'type': 'add',
                                'requirement': {
                                    'title': sub_req['title'],
                                    'description': sub_req['description'],
                                    'importance': sub_req['importance'],
                                    'category': sub_req['category'],
                                    'tags': sub_req['tags'],
                                    'parent_id': change['id']  # Link to parent for reference
                                }
                            })
                    else:
                        processed_changes.append(change)

                # Validate processed changes
                all_valid = True
                for change in processed_changes:
                    if change['type'] == 'add':
                        if not self._validate_requirement(change['requirement']):
                            all_valid = False
                            break
                    elif change['type'] == 'modify':
                        if 'id' not in change or 'updates' not in change:
                            all_valid = False
                            break
                        # Validate any requirement fields in updates
                        updates = change['updates']
                        if 'importance' in updates and updates['importance'] not in ['high', 'medium', 'low']:
                            all_valid = False
                            break
                        if 'category' in updates and updates['category'] not in ['frontend', 'backend', 'database', 'general']:
                            all_valid = False
                            break
                    elif change['type'] == 'remove':
                        if 'id' not in change:
                            all_valid = False
                            break
                    else:
                        all_valid = False
                        break
                
                if not all_valid:
                    print(f"Invalid changes in choice {choice.index}, trying next choice...")
                    continue
                
                # If we get here, the response is valid
                print(f"Found valid response in choice {choice.index}")
                self._apply_changes({'changes': processed_changes})
                return data['response']
                
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON in choice {choice.index}: {str(e)}")
                continue
            except Exception as e:
                print(f"Unexpected error in choice {choice.index}: {str(e)}")
                continue
        
        # If we get here, none of the choices were valid
        print("No valid choices found")
        return "I apologize, but I'm having trouble processing your request. Could you please rephrase it?"
    
    def get_next_question(self) -> Optional[str]:
        """Generate the next question to ask the user, if needed."""
        prompt = f"""Given the current requirements:
{self._format_requirements()}

And the conversation history:
{self._format_conversation_history()}

{"And the dataset information:" if self.dataset_info else ""}
{self._format_dataset_info() if self.dataset_info else ""}

Determine if any clarifying questions are needed to improve or complete the requirements.
If a question is needed, respond with just the question.
If no questions are needed, respond with 'NONE'."""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        
        question = response.choices[0].message.content.strip()
        print(f"Next question: {question}")
        return None if question == "NONE" else question
    
    def get_updated_requirements(self) -> List[str]:
        """Return the current list of requirements."""
        return self.requirements
    
    def _format_dataset_info(self) -> str:
        """Format dataset info for prompts."""
        if not self.dataset_info:
            return ""
            
        info = []
        for sheet_name, sheet_data in self.dataset_info.items():
            info.append(f"Sheet: {sheet_name}")
            info.append(f"Columns: {', '.join(sheet_data['columns'])}")
            info.append(f"Total rows: {sheet_data['total_rows']}")
            info.append("Sample data:")
            for row in sheet_data['sample_rows']:
                info.append(str(row))
            info.append("")  # Empty line between sheets
            
        return "\n".join(info).strip()
    
    def _format_conversation_history(self) -> str:
        """Format conversation history for prompts."""
        return "\n".join([
            f"{msg['role'].title()}: {msg['content']}"
            for msg in self.conversation_history
        ])
    
    def _format_requirements(self, requirements: Optional[List[Dict]] = None) -> str:
        """Format requirements for prompts. If no requirements provided, uses self.requirements."""
        reqs = requirements if requirements is not None else self.requirements
        return "\n".join([f"- {req['title']}" for req in reqs])

    def _apply_changes(self, data: Dict) -> None:
        """Apply changes to requirements."""
        for change in data.get('changes', []):
            if change['type'] == 'add':
                # Add new requirement with generated ID and metadata
                requirement = {
                    'id': self._generate_id(),
                    'title': change['requirement']['title'],
                    'description': change['requirement']['description'],
                    'importance': change['requirement']['importance'],
                    'category': change['requirement']['category'],
                    'tags': change['requirement']['tags'],
                    'dateAdded': self._get_current_timestamp(),
                    'dateModified': self._get_current_timestamp(),
                    'createdBy': 'ai-agent',
                    'changeHistory': [{
                        'type': 'created',
                        'timestamp': self._get_current_timestamp(),
                        'userId': 'ai-agent',
                        'details': 'Requirement created from chat'
                    }]
                }
                # Add parent_id if specified
                if 'parent_id' in change['requirement']:
                    requirement['parent_id'] = change['requirement']['parent_id']
                self.requirements.append(requirement)
                
            elif change['type'] == 'modify':
                # Find and update existing requirement
                for req in self.requirements:
                    if req['id'] == change['id']:
                        updates = change['updates']
                        # Create change history entry
                        changes = []
                        for key, value in updates.items():
                            if key != 'sub_requirements':  # Skip sub_requirements in history
                                old_value = req.get(key, 'None')
                                changes.append(f"{key} changed from '{old_value}' to '{value}'")
                        
                        history_entry = {
                            'type': 'modified',
                            'timestamp': self._get_current_timestamp(),
                            'userId': 'ai-agent',
                            'details': ', '.join(changes)
                        }
                        
                        # Update the requirement
                        req.update(updates)
                        req['dateModified'] = self._get_current_timestamp()
                        if 'changeHistory' not in req:
                            req['changeHistory'] = []
                        req['changeHistory'].append(history_entry)
                        break
                        
            elif change['type'] == 'remove':
                # Remove requirement by ID
                self.requirements = [req for req in self.requirements if req['id'] != change['id']]
