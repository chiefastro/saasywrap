// Screen Management
const screens = {
    upload: document.getElementById('upload-screen'),
    requirements: document.getElementById('requirements-screen'),
    blueprint: document.getElementById('blueprint-screen')
};

function showScreen(screenId) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

// Upload Screen Handlers
const datasetUpload = document.getElementById('dataset-upload');
const requirementsInput = document.getElementById('requirements-input');

datasetUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // TODO: Handle file upload
    // For now, just transition to requirements screen
    showScreen('requirements');
});

// Requirements Screen Handlers
const toBlueprintBtn = document.getElementById('to-blueprint-btn');
const requirementsList = document.getElementById('requirements-list');
const requirementsChatInput = document.getElementById('requirements-chat-input');

toBlueprintBtn.addEventListener('click', () => {
    showScreen('blueprint');
});

// Blueprint Screen Handlers
const viewRequirementsBtn = document.getElementById('view-requirements-btn');
const playAllPanelBtn = document.getElementById('play-all-panel-btn');
const playNextPanelBtn = document.getElementById('play-next-panel-btn');
const blueprintTransforms = document.getElementById('blueprint-transforms');
const blueprintChatInput = document.getElementById('blueprint-chat-input');

viewRequirementsBtn.addEventListener('click', () => {
    showScreen('requirements');
});

// Transform Execution Handlers
playAllPanelBtn.addEventListener('click', () => {
    // TODO: Implement play all functionality
});

playNextPanelBtn.addEventListener('click', () => {
    // TODO: Implement play next functionality
});

// Initialize to upload screen
showScreen('upload');
