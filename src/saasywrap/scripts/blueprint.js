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
                if (data.blueprint) {
                    this.blueprint = data.blueprint;
                    this.renderBlueprint();
                }
                if (data.preview) {
                    this.updatePreview(data.preview);
                }
            }
        });

        // Set additional request data for chat
        this.chatManager.setAdditionalRequestData(() => ({
            currentBlueprint: this.blueprint,
            previewState: this.previewState
        }));
        
        // Bind event listeners
        this.playAllPanelBtn.addEventListener('click', () => this.executeAllTransforms());
        this.playNextPanelBtn.addEventListener('click', () => this.executeNextTransform());
    }

    async initialize(requirements) {
        try {
            const response = await fetch('/api/generate-blueprint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requirements })
            });
            
            const data = await response.json();
            this.blueprint = data.blueprint;
            this.renderBlueprint();
            
            if (data.response) {
                this.addAgentMessage(data.response);
            }
        } catch (error) {
            console.error('Error generating blueprint:', error);
            this.addAgentMessage('Sorry, there was an error generating the blueprint. Please try again.');
        }
    }

    renderBlueprint() {
        this.transformsList.innerHTML = '';
        this.blueprint.forEach((transform, index) => {
            const transformElement = this.createTransformElement(transform, index);
            this.transformsList.appendChild(transformElement);
        });
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
                this.addAgentMessage(data.message);
            }
            
            return data.status === 'completed';
        } catch (error) {
            console.error('Error executing transform:', error);
            this.updateTransformStatus(transformId, 'failed');
            this.addAgentMessage('Sorry, there was an error executing this transform. Please try again.');
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

    addAgentMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message agent-message';
        messageEl.textContent = message;
        this.chatMessages.appendChild(messageEl);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        this.conversation_history.push({
            role: 'assistant',
            content: message
        });
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        this.chatMessages.appendChild(indicator);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Initialize the blueprint manager when the page loads
window.blueprintManager = new BlueprintManager();
