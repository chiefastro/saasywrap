#!/bin/bash

# Colors for output
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${CYAN}🚀 Starting SaasyWrap...${NC}"

# Check if conda is installed
if ! command_exists conda; then
    echo -e "${RED}❌ Conda is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Please install Conda in WSL using these steps:${NC}"
    echo -e "1. Download Miniconda:"
    echo -e "   ${CYAN}wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh${NC}"
    echo -e "2. Make the installer executable:"
    echo -e "   ${CYAN}chmod +x Miniconda3-latest-Linux-x86_64.sh${NC}"
    echo -e "3. Run the installer:"
    echo -e "   ${CYAN}./Miniconda3-latest-Linux-x86_64.sh${NC}"
    echo -e "4. Follow the prompts and restart your terminal"
    echo -e "5. Run this script again"
    exit 1
fi

# Try different methods to initialize conda
if [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    . "$HOME/miniconda3/etc/profile.d/conda.sh"
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    . "$HOME/anaconda3/etc/profile.d/conda.sh"
else
    eval "$(conda shell.bash hook)"
fi

# Check if environment exists
if ! conda env list | grep -q "saasywrap"; then
    echo -e "${YELLOW}Creating new conda environment 'saasywrap'...${NC}"
    conda env create -f environment.yml
else
    echo -e "${YELLOW}Updating existing conda environment 'saasywrap'...${NC}"
    conda env update -f environment.yml --prune
fi

# Activate the environment
conda activate saasywrap

echo -e "\n${GREEN}🌐 Starting Flask application...${NC}"

# Start Flask app in background
export FLASK_APP=src/saasywrap/app.py
export FLASK_ENV=development
flask run &

# Wait for Flask to initialize
echo -e "${YELLOW}Waiting for Flask to start...${NC}"
sleep 2

# Open browser
echo -e "${GREEN}The web application will open in your default browser.${NC}"
xdg-open http://localhost:5000 2>/dev/null || sensible-browser http://localhost:5000 2>/dev/null || echo -e "${YELLOW}Please open http://localhost:5000 in your browser${NC}"

echo -e "${YELLOW}Press Ctrl+C to stop the server when you're done.${NC}\n"
echo -e "${YELLOW}To stop the flask server, run: ${CYAN}pkill -f flask${NC}"
