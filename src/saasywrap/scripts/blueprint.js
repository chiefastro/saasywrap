class BlueprintManager {
    constructor() {
        this.blueprint = [];
        this.currentUserId = 'default-user';
        this.currentTransform = null;
        this.previewState = {};
        
        // DOM Elements
        this.transformsList = document.getElementById('blueprint-transforms');
        this.previewPanel = document.getElementById('app-preview');
        this.playAllPanelBtn = document.getElementById('play-all-panel-btn');
        this.playNextPanelBtn = document.getElementById('play-next-panel-btn');
        
        // Initialize chat manager
        this.chatManager = new ChatManager({
            chatId: 'blueprint-chat',
            inputId: 'blueprint-chat-input',
            sendButtonSelector: '#blueprint-screen .send-btn',
            apiEndpoint: '/api/chat/blueprint',
            onResponse: (data) => {
                // Apply changes to blueprint if any
                if (data.changes) {
                    for (const change of data.changes) {
                        if (change.type === 'add') {
                            this.blueprint.push(change.transform);
                        } else if (change.type === 'modify') {
                            const transform = this.blueprint.find(t => t.id === change.id);
                            if (transform) {
                                Object.assign(transform, change.updates);
                            }
                        } else if (change.type === 'remove') {
                            this.blueprint = this.blueprint.filter(t => t.id !== change.id);
                        }
                    }
                    this.renderBlueprint();
                }
            }
        });

        // Set additional request data for chat
        this.chatManager.setAdditionalRequestData(() => ({
            currentBlueprint: this.blueprint,
            previewState: this.previewState,
            requirements: window.requirementsManager.requirements
        }));
        
        // Bind event listeners
        this.playAllPanelBtn.addEventListener('click', () => this.executeAllTransforms());
        this.playNextPanelBtn.addEventListener('click', () => this.executeNextTransform());
    }

    async initialize(requirements) {
        try {
            // Show typing indicator while generating blueprint
            this.chatManager.showTypingIndicator();

            const response = await fetch('/api/generate-blueprint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requirements })
            });
            
            const data = await response.json();
            
            // Hide typing indicator before showing response
            this.chatManager.hideTypingIndicator();
            
            this.blueprint = data.blueprint;
            this.renderBlueprint();
            
            if (data.response) {
                this.chatManager.addAgentMessage(data.response);
            }
        } catch (error) {
            this.chatManager.hideTypingIndicator();
            console.error('Error generating blueprint:', error);
            this.chatManager.addAgentMessage('Sorry, there was an error generating the blueprint. Please try again.');
        }
    }

    renderBlueprint() {
        this.transformsList.innerHTML = '';
        this.blueprint.forEach((transform, index) => {
            const transformElement = this.createTransformElement(transform, index);
            this.transformsList.appendChild(transformElement);
        });
        
        // Scroll to the bottom of the transforms list
        this.transformsList.scrollTop = this.transformsList.scrollHeight;
    }

    createTransformElement(transform, index) {
        const container = document.createElement('div');
        container.className = 'blueprint-transform';
        container.dataset.transformId = transform.id;
        
        container.innerHTML = `
            <div class="transform-header">
                <span class="transform-number">${index + 1}</span>
                <h3 class="transform-title">${transform.title}</h3>
                <div class="transform-controls">
                    <button class="play-transform-btn" title="Execute this transform">▶</button>
                    <button class="play-until-btn" title="Execute until this transform">⏭</button>
                </div>
            </div>
            <div class="transform-description">${transform.description}</div>
            <div class="transform-status ${transform.status}">
                ${this.getStatusIcon(transform.status)}
                <span>${transform.status}</span>
            </div>
        `;

        // Add event listeners
        const playTransformBtn = container.querySelector('.play-transform-btn');
        const playUntilBtn = container.querySelector('.play-until-btn');
        
        playTransformBtn.addEventListener('click', () => this.executeTransform(transform.id));
        playUntilBtn.addEventListener('click', () => this.executeUntilTransform(transform.id));

        return container;
    }

    getStatusIcon(status) {
        const icons = {
            'pending': '⭕',
            'in_progress': '⏳',
            'completed': '✅',
            'failed': '❌',
            'rolled_back': '↩️'
        };
        return icons[status] || '⭕';
    }

    async executeTransform(transformId) {
        try {
            const response = await fetch(`/api/execute-blueprint-transform`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    transformId,
                    previewState: this.previewState
                })
            });
            
            const data = await response.json();
            
            // Update the preview
            if (data.preview) {
                this.updatePreview(data.preview);
            }
            
            // Update transform status
            this.updateTransformStatus(transformId, data.status);
            
            // Store preview state
            if (data.previewState) {
                this.previewState = data.previewState;
            }
            
            // Add any messages from the agent
            if (data.message) {
                this.chatManager.addAgentMessage(data.message);
            }
            
            return data.status === 'completed';
        } catch (error) {
            console.error('Error executing transform:', error);
            this.updateTransformStatus(transformId, 'failed');
            this.chatManager.addAgentMessage('Sorry, there was an error executing this transform. Please try again.');
            return false;
        }
    }

    async executeUntilTransform(targetTransformId) {
        for (const transform of this.blueprint) {
            const success = await this.executeTransform(transform.id);
            if (!success) {
                break;
            }
            if (transform.id === targetTransformId) {
                break;
            }
        }
    }

    async executeAllTransforms() {
        for (const transform of this.blueprint) {
            const success = await this.executeTransform(transform.id);
            if (!success) {
                break;
            }
        }
    }

    async executeNextTransform() {
        const pendingTransform = this.blueprint.find(b => b.status === 'pending');
        if (pendingTransform) {
            await this.executeTransform(pendingTransform.id);
        }
    }

    updateTransformStatus(transformId, status) {
        const transform = this.blueprint.find(b => b.id === transformId);
        if (transform) {
            transform.status = status;
            this.renderBlueprint();
        }
    }

    updatePreview(previewHtml) {
        this.previewPanel.innerHTML = previewHtml;
    }
}

// Initialize the blueprint manager when the page loads
window.blueprintManager = new BlueprintManager();
