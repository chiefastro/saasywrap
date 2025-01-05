from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
import os
from dotenv import load_dotenv
import pandas as pd
from agents.generate_requirements import RequirementsAgent
from agents.generate_blueprint import BlueprintAgent

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, 
           static_url_path='',
           static_folder='.',
           template_folder='templates')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/generate-requirements', methods=['POST'])
def generate_requirements():
    initial_requirements = ''
    file_path = None
    
    # Handle both FormData and JSON requests
    if request.content_type and 'multipart/form-data' in request.content_type:
        initial_requirements = request.form.get('requirements', '')
        file = request.files.get('dataset')
        if file:
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
    else:
        data = request.json
        if data:
            initial_requirements = data.get('requirements', '')
    
    # Initialize the requirements agent
    agent = RequirementsAgent()
    requirements = agent.generate_initial_requirements(initial_requirements, file_path)
    
    response_data = {
        'requirements': requirements,
        'response': agent.get_initial_response()
    }
    
    # Include the dataset path in response if a file was uploaded
    if file_path:
        response_data['datasetPath'] = file_path
        
    return jsonify(response_data)

@app.route('/api/chat/requirements', methods=['POST'])
def requirements_chat():
    data = request.json
    message = data.get('message', '')
    current_requirements = data.get('currentRequirements', [])
    chat_history = data.get('chatHistory', [])
    initial_context = data.get('initialContext', {})
    
    # Initialize the requirements agent with current state
    agent = RequirementsAgent()
    
    # Restore the conversation history
    agent.conversation_history = chat_history
    
    # Set the current requirements
    agent.requirements = current_requirements
    
    # Parse dataset if exists
    dataset_path = initial_context.get('datasetPath')
    if dataset_path:
        agent.parse_dataset(dataset_path)
    
    # Store the initial requirements text
    agent.initial_requirements = initial_context.get('requirements', '')
    
    # Process the message
    response = agent.process_message(message)
    updated_requirements = agent.get_updated_requirements()
    
    return jsonify({
        'response': response,
        'requirements': updated_requirements,
    })

@app.route('/api/generate-blueprint', methods=['POST'])
def generate_blueprint():
    data = request.json
    requirements = data.get('requirements', [])
    
    agent = BlueprintAgent()
    result = agent.generate_initial_blueprint(requirements)
    
    return jsonify(result)

@app.route('/api/execute-blueprint-transform', methods=['POST'])
def execute_blueprint_transform():
    data = request.json
    transform_id = data.get('transformId')
    preview_state = data.get('previewState', {})
    
    agent = BlueprintAgent()
    result = agent.execute_transform(transform_id, preview_state)
    
    return jsonify(result)

@app.route('/api/chat/blueprint', methods=['POST'])
def blueprint_chat():
    data = request.json
    message = data.get('message', '')
    current_blueprint = data.get('currentBlueprint', [])
    chat_history = data.get('chatHistory', [])
    preview_state = data.get('previewState', {})
    
    agent = BlueprintAgent()
    result = agent.process_message(message, current_blueprint, chat_history, preview_state)
    
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
