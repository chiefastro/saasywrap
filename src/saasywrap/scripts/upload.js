document.addEventListener('DOMContentLoaded', () => {
    const requirementsInput = document.getElementById('requirements-input');
    const datasetUpload = document.getElementById('dataset-upload');
    
    // Handle file upload and requirements submission
    datasetUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const requirements = requirementsInput.value.trim();
        if (!requirements) {
            alert('Please describe your application requirements before uploading a dataset.');
            return;
        }
        
        // Show loading state
        const uploadButton = datasetUpload.nextElementSibling;
        const originalText = uploadButton.textContent;
        uploadButton.textContent = 'Processing...';
        uploadButton.disabled = true;
        
        try {
            // Initialize requirements manager with initial data
            await window.requirementsManager.initialize(requirements, file);
            
            // Transition to requirements screen
            showScreen('requirements');
        } catch (error) {
            console.error('Error processing upload:', error);
            alert('There was an error processing your upload. Please try again.');
        } finally {
            // Reset upload button
            uploadButton.textContent = originalText;
            uploadButton.disabled = false;
        }
    });
    
    // Handle requirements-only submission (no dataset)
    requirementsInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            const requirements = requirementsInput.value.trim();
            if (!requirements) {
                alert('Please describe your application requirements.');
                return;
            }
            
            try {
                // Initialize requirements manager with just requirements
                await window.requirementsManager.initialize(requirements);
                
                // Transition to requirements screen
                showScreen('requirements');
            } catch (error) {
                console.error('Error processing requirements:', error);
                alert('There was an error processing your requirements. Please try again.');
            }
        }
    });
}); 