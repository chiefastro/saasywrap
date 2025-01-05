class RequirementsManager {
    constructor() {
        this.requirements = [];
        this.currentUserId = 'default-user';
        this.initialContext = {
            requirements: '',
            datasetPath: null,
            datasetName: null
        };
        
        // DOM Elements
        this.requirementsList = document.getElementById('requirements-list');
        this.addRequirementBtn = document.getElementById('add-requirement-button');
        
        // Initialize chat manager
        this.chatManager = new ChatManager({
            chatId: 'requirements-chat',
            inputId: 'requirements-chat-input',
            sendButtonSelector: '#requirements-screen .send-btn',
            apiEndpoint: '/api/chat/requirements',
            onResponse: (data) => {
                if (data.requirements) {
                    // Update existing requirements and add new ones
                    const updatedRequirements = [...this.requirements];
                    
                    data.requirements.forEach(newReq => {
                        const existingIndex = updatedRequirements.findIndex(r => r.id === newReq.id);
                        if (existingIndex !== -1) {
                            // Update existing requirement
                            updatedRequirements[existingIndex] = this.enrichRequirement({
                                ...updatedRequirements[existingIndex],
                                ...newReq
                            });
                        } else {
                            // Add new requirement
                            updatedRequirements.push(this.enrichRequirement(newReq));
                        }
                    });
                    
                    // Remove any requirements that were marked for deletion
                    if (data.deletedRequirements) {
                        data.deletedRequirements.forEach(id => {
                            const index = updatedRequirements.findIndex(r => r.id === id);
                            if (index !== -1) {
                                updatedRequirements.splice(index, 1);
                            }
                        });
                    }
                    
                    this.requirements = updatedRequirements;
                    this.renderRequirements();
                    
                    // Notify blueprint manager of requirement changes
                    window.eventBus.emit('requirements:updated', this.requirements);
                }
            }
        });

        // Set additional request data for chat
        this.chatManager.setAdditionalRequestData(() => ({
            currentRequirements: this.requirements,
            initialContext: this.initialContext
        }));

        // Listen for transform changes
        window.eventBus.on('transforms:updated', this.handleTransformsUpdate.bind(this));
    }

    handleTransformsUpdate(transforms) {
        // Check for unassigned requirements
        const allReqIds = new Set(transforms.flatMap(t => t.requirement_ids));
        const unreferencedReqs = this.requirements.filter(r => !allReqIds.has(r.id));

        if (unreferencedReqs.length > 0) {
            this.chatManager.addAgentMessage(
                `The following requirements are not referenced by any transform: ` +
                `${unreferencedReqs.map(r => r.title).join(', ')}.\n\n` +
                `Would you like me to:\n` +
                `1. Mark these requirements as optional/future work\n` +
                `2. Remove these requirements\n` +
                `3. Keep them as is\n\n` +
                `Please respond with your choice (1-3) and any additional instructions. ` +
                `Note: To create new transforms for these requirements, please use the blueprint chat.`
            );
        }

        // Check for newly referenced requirements
        const newlyReferencedReqs = this.requirements.filter(r => 
            allReqIds.has(r.id) && 
            !this.getTransformsForRequirement(r.id, transforms).length
        );

        if (newlyReferencedReqs.length > 0) {
            const referencingTransforms = transforms.filter(t =>
                t.requirement_ids.some(reqId => newlyReferencedReqs.some(r => r.id === reqId))
            );

            this.chatManager.addAgentMessage(
                `Some requirements are newly referenced by transforms:\n` +
                newlyReferencedReqs.map(r => 
                    `- ${r.title} is now used in: ${
                        referencingTransforms
                            .filter(t => t.requirement_ids.includes(r.id))
                            .map(t => t.title)
                            .join(', ')
                    }`
                ).join('\n') + '\n\n' +
                `Would you like me to:\n` +
                `1. Review and update the requirements to ensure they're clear and complete\n` +
                `2. Add more details or acceptance criteria to the requirements\n` +
                `3. Keep the requirements as is\n\n` +
                `Please respond with your choice (1-3) and any additional instructions. ` +
                `Note: To modify the transforms themselves, please use the blueprint chat.`
            );
        }

        // Check for requirement overlap in transforms
        const reqToTransformMap = new Map();
        transforms.forEach(t => {
            t.requirement_ids.forEach(reqId => {
                if (!reqToTransformMap.has(reqId)) {
                    reqToTransformMap.set(reqId, new Set());
                }
                reqToTransformMap.get(reqId).add(t.id);
            });
        });

        const overlappingReqs = Array.from(reqToTransformMap.entries())
            .filter(([_, transformIds]) => transformIds.size > 1)
            .map(([reqId, transformIds]) => ({
                requirement: this.requirements.find(r => r.id === reqId),
                transforms: transforms.filter(t => transformIds.has(t.id))
            }))
            .filter(({requirement}) => requirement); // Filter out any invalid requirement IDs

        if (overlappingReqs.length > 0) {
            this.chatManager.addAgentMessage(
                `Some requirements are implemented by multiple transforms:\n` +
                overlappingReqs.map(({requirement, transforms}) =>
                    `- ${requirement.title} is implemented in: ${transforms.map(t => t.title).join(', ')}`
                ).join('\n') + '\n\n' +
                `Would you like me to:\n` +
                `1. Split these requirements into more granular ones\n` +
                `2. Add clarification about which aspects each transform should handle\n` +
                `3. Keep the requirements as is\n\n` +
                `Please respond with your choice (1-3) and any additional instructions. ` +
                `Note: To modify how the transforms implement these requirements, please use the blueprint chat.`
            );
        }

        // Re-render to update any transform references
        this.renderRequirements();
    }

    getTransformsForRequirement(reqId, transforms) {
        return transforms.filter(t => t.requirement_ids.includes(reqId));
    }

    generateId() {
        return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    enrichRequirement(req, isNew = false) {
        const now = new Date().toISOString();
        return {
            ...req,
            id: req.id || this.generateId(),
            dateModified: now,
            dateAdded: req.dateAdded || now,
            createdBy: req.createdBy || this.currentUserId,
            changeHistory: req.changeHistory || [{
                type: 'created',
                timestamp: now,
                userId: this.currentUserId,
                details: isNew ? 'Requirement created by user' : 'Requirement generated by AI'
            }]
        };
    }
    
    async initialize(initialRequirements, initialDataset) {
        try {
            let response;
            this.initialContext.requirements = initialRequirements;

            // Add initial requirements as first message in chat
            if (initialRequirements) {
                this.chatManager.addUserMessage("Initial Requirements:\n" + initialRequirements);
            }

            // Show typing indicator before API call
            this.chatManager.showTypingIndicator();

            if (initialDataset) {
                const formData = new FormData();
                formData.append('dataset', initialDataset);
                formData.append('requirements', initialRequirements);
                
                // Store dataset info
                this.initialContext.datasetName = initialDataset.name;
                
                response = await fetch('/api/generate-requirements', {
                    method: 'POST',
                    body: formData
                });
            } else {
                response = await fetch('/api/generate-requirements', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requirements: initialRequirements
                    })
                });
            }
            
            const data = await response.json();
            
            // Hide typing indicator before showing response
            this.chatManager.hideTypingIndicator();
            
            // Enrich the requirements with metadata
            this.requirements = data.requirements.map(req => this.enrichRequirement(req));
            this.renderRequirements();
            
            // Add AI's response
            if (data.response) {
                this.chatManager.addAgentMessage(data.response);
            }

            // Store the dataset path if returned from backend
            if (data.datasetPath) {
                this.initialContext.datasetPath = data.datasetPath;
            }
        } catch (error) {
            // Hide typing indicator on error
            this.chatManager.hideTypingIndicator();
            console.error('Error generating requirements:', error);
            this.chatManager.addAgentMessage('Sorry, there was an error generating the requirements. Please try again.');
        }
    }

    renderRequirements() {
        this.requirementsList.innerHTML = '';
        this.requirements.forEach(req => {
            const reqElement = this.createRequirementElement(req);
            this.requirementsList.appendChild(reqElement);
        });
        
        // Scroll to the bottom of the requirements list
        this.requirementsList.scrollTop = this.requirementsList.scrollHeight;
    }

    createRequirementElement(req) {
        const container = document.createElement('div');
        container.className = 'requirement-container';
        
        // Define default categories but allow for custom ones
        const defaultCategories = ['frontend', 'backend', 'database', 'uncategorized'];
        const allCategories = [...new Set([...defaultCategories, req.category || 'uncategorized'])].sort();
        
        container.innerHTML = `
            <div class="requirement-content">
                <div class="requirement-header">
                    <div class="requirement-title" contenteditable="true">${req.title}</div>
                    <div class="requirement-meta">
                        <select class="importance-select">
                            <option value="low" ${req.importance === 'low' ? 'selected' : ''}>Low</option>
                            <option value="medium" ${req.importance === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="high" ${req.importance === 'high' ? 'selected' : ''}>High</option>
                        </select>
                        <select class="category-select">
                            ${allCategories.map(category => `
                                <option value="${category}" ${req.category === category ? 'selected' : ''}>
                                    ${category.charAt(0).toUpperCase() + category.slice(1)}
                                </option>
                            `).join('')}
                        </select>
                        <button class="history-btn">History</button>
                    </div>
                </div>
                <div class="requirement-description" contenteditable="true">${req.description}</div>
                <div class="requirement-tags">
                    <div class="tags-list">
                        ${(req.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <input type="text" class="tag-input" placeholder="Add tag...">
                </div>
                <div class="requirement-footer">
                    <span class="requirement-date">Modified: ${new Date(req.dateModified).toLocaleDateString()}</span>
                    <span class="requirement-author">Created by: ${req.createdBy}</span>
                </div>
                <div class="change-history hidden">
                    <h4>Change History</h4>
                    <div class="history-list">
                        ${(req.changeHistory || []).map(change => `
                            <div class="history-item">
                                <span class="history-type">${change.type}</span>
                                <span class="history-details">${change.details}</span>
                                <span class="history-time">${new Date(change.timestamp).toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <button class="delete-requirement">×</button>
        `;

        // Add event listeners
        const titleEl = container.querySelector('.requirement-title');
        const descEl = container.querySelector('.requirement-description');
        const importanceSelect = container.querySelector('.importance-select');
        const categorySelect = container.querySelector('.category-select');
        const tagInput = container.querySelector('.tag-input');
        const deleteBtn = container.querySelector('.delete-requirement');
        const historyBtn = container.querySelector('.history-btn');
        const historyPanel = container.querySelector('.change-history');

        titleEl.addEventListener('blur', () => {
            const newTitle = titleEl.textContent;
            if (newTitle !== req.title) {
                this.updateRequirement(req.id, { 
                    title: newTitle,
                    dateModified: new Date().toISOString(),
                    changeHistory: [...(req.changeHistory || []), {
                        type: 'title_changed',
                        timestamp: new Date().toISOString(),
                        userId: this.currentUserId,
                        details: `Title changed from "${req.title}" to "${newTitle}"`
                    }]
                });
            }
        });

        descEl.addEventListener('blur', () => {
            const newDesc = descEl.textContent;
            if (newDesc !== req.description) {
                this.updateRequirement(req.id, { 
                    description: newDesc,
                    dateModified: new Date().toISOString(),
                    changeHistory: [...(req.changeHistory || []), {
                        type: 'description_changed',
                        timestamp: new Date().toISOString(),
                        userId: this.currentUserId,
                        details: 'Description updated'
                    }]
                });
            }
        });

        importanceSelect.addEventListener('change', () => {
            const newImportance = importanceSelect.value;
            this.updateRequirement(req.id, { 
                importance: newImportance,
                dateModified: new Date().toISOString(),
                changeHistory: [...(req.changeHistory || []), {
                    type: 'importance_changed',
                    timestamp: new Date().toISOString(),
                    userId: this.currentUserId,
                    details: `Importance changed to ${newImportance}`
                }]
            });
        });

        categorySelect.addEventListener('change', () => {
            const newCategory = categorySelect.value;
            this.updateRequirement(req.id, { 
                category: newCategory,
                dateModified: new Date().toISOString(),
                changeHistory: [...(req.changeHistory || []), {
                    type: 'category_changed',
                    timestamp: new Date().toISOString(),
                    userId: this.currentUserId,
                    details: `Category changed to ${newCategory}`
                }]
            });
        });

        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                const newTag = e.target.value.trim();
                if (!req.tags.includes(newTag)) {
                    this.updateRequirement(req.id, { 
                        tags: [...(req.tags || []), newTag],
                        dateModified: new Date().toISOString(),
                        changeHistory: [...(req.changeHistory || []), {
                            type: 'tag_added',
                            timestamp: new Date().toISOString(),
                            userId: this.currentUserId,
                            details: `Tag "${newTag}" added`
                        }]
                    });
                }
                e.target.value = '';
            }
        });

        historyBtn.addEventListener('click', () => {
            historyPanel.classList.toggle('hidden');
        });

        deleteBtn.addEventListener('click', () => this.deleteRequirement(req.id));

        return container;
    }

    updateRequirement(id, updates) {
        const index = this.requirements.findIndex(r => r.id === id);
        if (index !== -1) {
            const oldReq = this.requirements[index];
            
            // Create change history entry
            const changes = Object.entries(updates)
                .filter(([key]) => key !== 'changeHistory' && key !== 'dateModified')
                .map(([key, value]) => {
                    if (key === 'tags') {
                        return `tags updated`;
                    } else {
                        return `${key} changed from "${oldReq[key]}" to "${value}"`;
                    }
                })
                .join(', ');

            const historyEntry = {
                type: 'modified',
                timestamp: new Date().toISOString(),
                userId: this.currentUserId,
                details: changes
            };

            // Update the requirement
            this.requirements[index] = {
                ...oldReq,
                ...updates,
                dateModified: new Date().toISOString(),
                changeHistory: [...(oldReq.changeHistory || []), historyEntry]
            };

            this.renderRequirements();
        }
    }

    addNewRequirement() {
        const newReq = this.enrichRequirement({
            title: 'New Requirement',
            description: 'Add description here...',
            importance: 'medium',
            category: 'uncategorized',
            tags: []
        }, true);
        
        this.requirements.push(newReq);
        this.renderRequirements();
        
        // Focus on the title of the new requirement
        const newReqElement = this.requirementsList.lastElementChild;
        if (newReqElement) {
            const titleEl = newReqElement.querySelector('.requirement-title');
            titleEl.focus();
            document.execCommand('selectAll', false, null);
        }
    }
    
    deleteRequirement(id) {
        this.requirements = this.requirements.filter(r => r.id !== id);
        this.renderRequirements();
    }
}

// Initialize the requirements manager when the page loads
window.requirementsManager = new RequirementsManager();
