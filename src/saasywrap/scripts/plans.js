class PlansManager {
    constructor() {
        this.plans = [];
        this.chatMessages = [];
        this.conversation_history = [];
        this.currentUserId = 'default-user';
        this.currentStep = null;
        this.previewState = {};
        
        // DOM Elements
        this.plansList = document.getElementById('plan-steps');
        this.chatMessages = document.getElementById('plans-chat');
        this.chatInput = document.getElementById('plans-chat-input');
        this.previewPanel = document.getElementById('app-preview');
        this.playAllBtn = document.getElementById('play-all-btn');
        this.playNextBtn = document.getElementById('play-next-btn');
        this.sendBtn = document.querySelector('#plans-screen .send-btn');
        
        // Bind event listeners
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const value = this.chatInput.value.trim();
                e.preventDefault();
                if (value) {
                    this.processMessage(value);
                }
            }
        });
        
        this.sendBtn.addEventListener('click', () => {
            const value = this.chatInput.value.trim();
            if (value) {
                this.processMessage(value);
            }
        });
        
        this.playAllBtn.addEventListener('click', () => this.executeAllSteps());
        this.playNextBtn.addEventListener('click', () => this.executeNextStep());
    }

    async initialize(requirements) {
        try {
            const response = await fetch('/api/generate-plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requirements })
            });
            
            const data = await response.json();
            this.plans = data.plans;
            this.renderPlans();
            
            if (data.response) {
                this.addAgentMessage(data.response);
            }
        } catch (error) {
            console.error('Error generating plan:', error);
            this.addAgentMessage('Sorry, there was an error generating the plan. Please try again.');
        }
    }

    renderPlans() {
        this.plansList.innerHTML = '';
        this.plans.forEach((plan, index) => {
            const planElement = this.createPlanElement(plan, index);
            this.plansList.appendChild(planElement);
        });
    }

    createPlanElement(plan, index) {
        const container = document.createElement('div');
        container.className = 'plan-step';
        container.dataset.stepId = plan.id;
        
        container.innerHTML = `
            <div class="step-header">
                <span class="step-number">${index + 1}</span>
                <h3 class="step-title">${plan.title}</h3>
                <div class="step-controls">
                    <button class="play-step-btn" title="Execute this step">▶</button>
                    <button class="play-until-btn" title="Execute until this step">⏭</button>
                </div>
            </div>
            <div class="step-description">${plan.description}</div>
            <div class="step-status ${plan.status}">
                ${this.getStatusIcon(plan.status)}
                <span>${plan.status}</span>
            </div>
        `;

        // Add event listeners
        const playStepBtn = container.querySelector('.play-step-btn');
        const playUntilBtn = container.querySelector('.play-until-btn');
        
        playStepBtn.addEventListener('click', () => this.executeStep(plan.id));
        playUntilBtn.addEventListener('click', () => this.executeUntilStep(plan.id));

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

    async executeStep(stepId) {
        try {
            const response = await fetch(`/api/execute-plan-step`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stepId,
                    previewState: this.previewState
                })
            });
            
            const data = await response.json();
            
            // Update the preview
            if (data.preview) {
                this.updatePreview(data.preview);
            }
            
            // Update step status
            this.updateStepStatus(stepId, data.status);
            
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
            console.error('Error executing step:', error);
            this.updateStepStatus(stepId, 'failed');
            this.addAgentMessage('Sorry, there was an error executing this step. Please try again.');
            return false;
        }
    }

    async executeUntilStep(targetStepId) {
        for (const plan of this.plans) {
            const success = await this.executeStep(plan.id);
            if (!success) {
                break;
            }
            if (plan.id === targetStepId) {
                break;
            }
        }
    }

    async executeAllSteps() {
        for (const plan of this.plans) {
            const success = await this.executeStep(plan.id);
            if (!success) {
                break;
            }
        }
    }

    async executeNextStep() {
        const pendingStep = this.plans.find(p => p.status === 'pending');
        if (pendingStep) {
            await this.executeStep(pendingStep.id);
        }
    }

    updateStepStatus(stepId, status) {
        const step = this.plans.find(p => p.id === stepId);
        if (step) {
            step.status = status;
            this.renderPlans();
        }
    }

    updatePreview(previewHtml) {
        this.previewPanel.innerHTML = previewHtml;
    }

    async processMessage(message) {
        this.addUserMessage(message);
        this.chatInput.value = '';
        
        this.showTypingIndicator();
        
        try {
            const response = await fetch('/api/chat/plans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    currentPlans: this.plans,
                    chatHistory: this.conversation_history,
                    previewState: this.previewState
                })
            });
            
            const data = await response.json();
            
            this.hideTypingIndicator();
            
            if (data.response) {
                this.addAgentMessage(data.response);
            }
            
            if (data.plans) {
                this.plans = data.plans;
                this.renderPlans();
            }
            
            if (data.preview) {
                this.updatePreview(data.preview);
            }
        } catch (error) {
            this.hideTypingIndicator();
            console.error('Error processing message:', error);
            this.addAgentMessage('Sorry, there was an error processing your message. Please try again.');
        }
    }

    addUserMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message user-message';
        messageEl.textContent = message;
        this.chatMessages.appendChild(messageEl);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        this.conversation_history.push({
            role: 'user',
            content: message
        });
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

// Initialize the plans manager when the page loads
window.plansManager = new PlansManager();
