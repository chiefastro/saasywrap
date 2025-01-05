// Screen Management
const screens = {
    upload: document.getElementById('upload-screen'),
    requirements: document.getElementById('requirements-screen'),
    plans: document.getElementById('plans-screen')
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
const toPlanBtn = document.getElementById('to-plans-btn');
const requirementsList = document.getElementById('requirements-list');
const requirementsChatInput = document.getElementById('requirements-chat-input');

toPlanBtn.addEventListener('click', () => {
    showScreen('plans');
});

// Plans Screen Handlers
const viewRequirementsBtn = document.getElementById('view-requirements-btn');
const playAllBtn = document.getElementById('play-all-btn');
const playNextBtn = document.getElementById('play-next-btn');
const planSteps = document.getElementById('plan-steps');
const plansChatInput = document.getElementById('plans-chat-input');

viewRequirementsBtn.addEventListener('click', () => {
    showScreen('requirements');
});

// Plan Execution Handlers
playAllBtn.addEventListener('click', () => {
    // TODO: Implement play all functionality
});

playNextBtn.addEventListener('click', () => {
    // TODO: Implement play next functionality
});

// Initialize to upload screen
showScreen('upload');
