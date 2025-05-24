# 🎯 Quick Recipe Recommender

[![Node.js CI](https://img.shields.io/github/actions/workflow/status/bensaviofernandez/recipe-bot/node.js.yml?branch=master)](https://github.com/bensaviofernandez/recipe-bot/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Azure SDK](https://img.shields.io/badge/Azure-Computer%20Vision%20%7C%20Cosmos%20DB%20%7C%20OpenAI-blue)](#tech-stack)

A **multimodal** recipe recommender built on Azure:  
- **Image-based** (detects ingredients via Computer Vision tags + object detection + captions)  
- **Text-based** (simple comma-separated ingredients)  
- **Cosmos DB** to store “easy” recipes  
- **Azure OpenAI** (GPT) to generate one-sentence recipe descriptions  

---

## 🚀 Demo

![Demo GIF](./docs/demo.gif)

---

## 📖 Table of Contents

1. [Features](#features)  
2. [Architecture](#architecture)  
3. [Prerequisites](#prerequisites)  
4. [Getting Started](#getting-started)  
5. [Configuration](#configuration)  
6. [Usage](#usage)  
7. [Tech Stack](#tech-stack)  
8. [Contributing](#contributing)  
9. [License](#license)

---

## ✨ Features

- **Multimodal Input**  
  - Upload / paste an image URL of ingredients  
  - Or enter text list of ingredients  
- **Azure Computer Vision**  
  - Tags, object detection, and optional captions  
- **Azure Cosmos DB**  
  - Stores JSON recipes (`id`, `name`, `ingredients`, `cook_time`, `difficulty`, `instructions`, `tags`)  
  - Fast Core (SQL) queries  
- **Azure OpenAI**  
  - GPT-based chat completions to return human-friendly descriptions  
- **Clean UI**  
  - Plain HTML/JS, responsive, no extra frameworks  

---

## 🏗 Architecture

![Architecture Diagram](./docs/architecture.png)

1. **UI** (HTML/JS)  
2. **Node.js + Restify** API  
3. **Computer Vision** → detect tags/objects/caption  
4. **Cosmos DB** → query “easy” recipes  
5. **OpenAI (GPT)** → describe recipes  
6. **Browser** ← displays results  

---

## 🛠 Prerequisites

- **Node.js** ≥ 16  
- **npm** or **yarn**  
- An **Azure subscription** with:  
  - **Computer Vision** or **AI Foundry** resource  
  - **Cosmos DB (Core SQL)** account + database `recipebot-db`, container `recipe-DB`  
  - **Azure OpenAI** deployment (e.g. `gpt-35-turbo`)  

---

## ⚡ Getting Started

```bash
# 1. Clone
git clone https://github.com/bensaviofernandez/recipe-bot.git
cd recipe-bot

# 2. Install
npm install

# 3. Create .env (see below)

# 4. Run
npm start
# or
node index.js

# 5. Browse
open http://localhost:3978
