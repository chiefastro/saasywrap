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
        
        // Create modal container
        this.requirementModal = document.createElement('div');
        this.requirementModal.className = 'requirement-modal hidden';
        this.requirementModal.innerHTML = `
            <div class="requirement-modal-content">
                <div class="requirement-modal-header">
                    <h3></h3>
                    <button class="close-modal-btn">×</button>
                </div>
                <div class="requirement-modal-body"></div>
            </div>
        `;
        document.body.appendChild(this.requirementModal);
        
        // Modal close handlers
        this.requirementModal.querySelector('.close-modal-btn').addEventListener('click', () => {
            this.requirementModal.classList.add('hidden');
        });
        this.requirementModal.addEventListener('click', (e) => {
            if (e.target === this.requirementModal) {
                this.requirementModal.classList.add('hidden');
            }
        });
        
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
                    
                    // Notify requirements manager of transform changes
                    window.eventBus.emit('transforms:updated', this.blueprint);
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

        // Listen for requirement changes
        window.eventBus.on('requirements:updated', this.handleRequirementsUpdate.bind(this));
    }

    handleRequirementsUpdate(requirements) {
        // Check for deleted requirements
        const deletedReqIds = new Set(
            this.blueprint.flatMap(t => t.requirement_ids)
                .filter(reqId => !requirements.find(r => r.id === reqId))
        );

        if (deletedReqIds.size > 0) {
            const affectedTransforms = this.blueprint.filter(t => 
                t.requirement_ids.some(reqId => deletedReqIds.has(reqId))
            );

            if (affectedTransforms.length > 0) {
                this.chatManager.addAgentMessage(
                    `Some requirements referenced by transforms have been deleted. ` +
                    `Affected transforms: ${affectedTransforms.map(t => t.title).join(', ')}. \n\n` +
                    `Would you like me to:\n` +
                    `1. Remove these transforms\n` +
                    `2. Keep the transforms but remove the deleted requirement references\n` +
                    `3. Update these transforms to implement different requirements\n\n` +
                    `Please respond with your choice (1-3) and any additional instructions. ` +
                    `Note: If you want to restore the deleted requirements, please use the requirements chat.`
                );
            }
        }

        // Check for modified requirements
        const modifiedReqs = requirements.filter(newReq => {
            const oldReq = this.blueprint.flatMap(t => t.requirement_ids)
                .find(reqId => reqId === newReq.id);
            return oldReq && (
                newReq.title !== oldReq.title ||
                newReq.description !== oldReq.description ||
                newReq.importance !== oldReq.importance
            );
        });

        if (modifiedReqs.length > 0) {
            const affectedTransforms = this.blueprint.filter(t =>
                t.requirement_ids.some(reqId => modifiedReqs.some(r => r.id === reqId))
            );

            if (affectedTransforms.length > 0) {
                this.chatManager.addAgentMessage(
                    `Some requirements referenced by transforms have been modified. ` +
                    `Modified requirements: ${modifiedReqs.map(r => r.title).join(', ')}. ` +
                    `Affected transforms: ${affectedTransforms.map(t => t.title).join(', ')}.\n\n` +
                    `Would you like me to:\n` +
                    `1. Update the transforms' descriptions and implementation details\n` +
                    `2. Split or combine transforms to better match the modified requirements\n` +
                    `3. Keep the transforms as is\n\n` +
                    `Please respond with your choice (1-3) and any additional instructions. ` +
                    `Note: To make further modifications to the requirements, please use the requirements chat.`
                );
            }
        }

        // Check for transforms with no requirements
        const transformsWithoutReqs = this.blueprint.filter(t => 
            !t.requirement_ids || t.requirement_ids.length === 0
        );

        if (transformsWithoutReqs.length > 0) {
            this.chatManager.addAgentMessage(
                `The following transforms have no requirements assigned: ` +
                `${transformsWithoutReqs.map(t => t.title).join(', ')}.\n\n` +
                `Would you like me to:\n` +
                `1. Assign existing requirements that match these transforms\n` +
                `2. Remove these transforms\n` +
                `3. Keep them as is\n\n` +
                `Please respond with your choice (1-3) and any additional instructions. ` +
                `Note: To create new requirements for these transforms, please use the requirements chat.`
            );
        }

        // Re-render to update any requirement references
        this.renderBlueprint();
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
        
        // Get linked requirements
        const linkedRequirements = transform.requirement_ids.map(reqId => {
            const req = window.requirementsManager.requirements.find(r => r.id === reqId);
            return req ? `<span class="requirement-link" data-req-id="${reqId}" title="Click to view details">${req.title}</span>` : reqId;
        }).join(', ');
        
        container.innerHTML = `
            <div class="transform-header" role="button" tabindex="0">
                <div class="transform-header-row">
                    <span class="transform-number">${index + 1}</span>
                    <h3 class="transform-title">${transform.title}</h3>
                </div>
                <div class="transform-header-row">
                    <div class="transform-type ${transform.transform_type}">${transform.transform_type}</div>
                    <div class="transform-status ${transform.status}">
                        ${this.getStatusIcon(transform.status)}
                        <span>${transform.status}</span>
                    </div>
                    <div class="transform-controls">
                        <button class="play-transform-btn" title="Execute this transform">▶</button>
                        <button class="play-until-btn" title="Execute until this transform">⏭</button>
                        <button class="toggle-details-btn" title="Toggle details">▼</button>
                    </div>
                </div>
            </div>
            <div class="transform-details hidden">
                <div class="transform-description">${transform.description}</div>
                <div class="transform-metadata">
                    <div class="transform-requirements">
                        <strong>Requirements:</strong> ${linkedRequirements}
                    </div>
                    <div class="transform-time">
                        <strong>Estimated Time:</strong> ${transform.estimated_time}
                    </div>
                    ${transform.dependencies.length > 0 ? `
                    <div class="transform-dependencies">
                        <strong>Dependencies:</strong> ${transform.dependencies.join(', ')}
                    </div>` : ''}
                </div>
            </div>
        `;

        // Add event listeners
        const header = container.querySelector('.transform-header');
        const details = container.querySelector('.transform-details');
        const toggleBtn = container.querySelector('.toggle-details-btn');
        const playTransformBtn = container.querySelector('.play-transform-btn');
        const playUntilBtn = container.querySelector('.play-until-btn');
        
        const toggleDetails = (e) => {
            // Don't toggle if clicking play buttons or requirement links
            if (e.target.closest('.play-transform-btn, .play-until-btn, .requirement-link')) {
                return;
            }
            details.classList.toggle('hidden');
            toggleBtn.textContent = details.classList.contains('hidden') ? '▼' : '▲';
        };
        
        header.addEventListener('click', toggleDetails);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleDetails(e);
            }
        });
        
        // Add requirement click handlers
        container.querySelectorAll('.requirement-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const reqId = link.dataset.reqId;
                this.showRequirementDetails(reqId);
            });
        });
        
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

    showRequirementDetails(reqId) {
        const req = window.requirementsManager.requirements.find(r => r.id === reqId);
        if (!req) return;

        const modalHeader = this.requirementModal.querySelector('.requirement-modal-header h3');
        const modalBody = this.requirementModal.querySelector('.requirement-modal-body');

        modalHeader.textContent = req.title;
        modalBody.innerHTML = `
            <div class="requirement-content">
                <div class="requirement-description">${req.description}</div>
                <div class="requirement-metadata">
                    <div class="requirement-importance">
                        <strong>Importance:</strong> ${req.importance}
                    </div>
                    <div class="requirement-category">
                        <strong>Category:</strong> ${req.category}
                    </div>
                    ${req.tags && req.tags.length > 0 ? `
                    <div class="requirement-tags">
                        <strong>Tags:</strong>
                        <div class="tags-list">
                            ${req.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="requirement-footer">
                    <span class="requirement-date">Modified: ${new Date(req.dateModified).toLocaleDateString()}</span>
                    <span class="requirement-author">Created by: ${req.createdBy}</span>
                </div>
            </div>
        `;

        this.requirementModal.classList.remove('hidden');
    }
}

// Initialize the blueprint manager when the page loads
window.blueprintManager = new BlueprintManager();
