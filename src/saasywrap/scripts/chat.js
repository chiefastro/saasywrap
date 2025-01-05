class ChatManager {
    constructor(options) {
        const {
            chatId,          // ID of the chat messages container
            inputId,         // ID of the chat input
            sendButtonSelector, // Selector for the send button
            apiEndpoint,     // API endpoint for chat messages
            onResponse      // Callback for handling responses
        } = options;

        // DOM Elements
        this.chatMessages = document.getElementById(chatId);
        this.chatInput = document.getElementById(inputId);
        this.sendBtn = document.querySelector(sendButtonSelector);
        
        // State
        this.conversation_history = [];
        this.apiEndpoint = apiEndpoint;
        this.onResponse = onResponse;
        
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
    }

    async processMessage(message) {
        this.addUserMessage(message);
        this.chatInput.value = '';
        
        this.showTypingIndicator();
        
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    chatHistory: this.conversation_history
                })
            });
            
            const data = await response.json();
            
            this.hideTypingIndicator();
            
            if (data.response) {
                this.addAgentMessage(data.response);
            }
            
            // Call the response handler if provided
            if (this.onResponse) {
                this.onResponse(data);
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

    clearChat() {
        this.chatMessages.innerHTML = '';
        this.conversation_history = [];
    }

    setAdditionalRequestData(getData) {
        this.getAdditionalRequestData = getData;
    }
}
