// ==================== SPACED REPETITION FLASHCARD APP ====================

// Global state
let decks = [];
let currentDeck = null;
let cards = [];
let currentCardIndex = 0;
let isFlipped = false;

// Ollama configuration with user-editable settings
let aiConfig = {
    baseUrl: 'http://localhost:11434',
    model: 'mistral',
    temperature: 0.7,
    maxTokens: 500,
    promptTemplate: 'Create {count} educational flashcards about: {topic}\n\nFormat each card as:\nQ: [question]\nA: [answer]\n\nMake the questions clear and the answers concise.',
    cardCount: '3-7',
    systemPrompt: 'You are a helpful assistant that creates educational flashcards. Make it simple. You can generate questions or cloze quizzes Where the answer of a flashcard is only a sentence, if its a process. But if its a fact, if generally better be in a list that include every constituent, but if a definite fact better be in a single word.'
};

// Load AI config from localStorage
function loadAIConfig() {
    try {
        const savedConfig = localStorage.getItem('ai_config');
        if (savedConfig) {
            aiConfig = { ...aiConfig, ...JSON.parse(savedConfig) };
        }
    } catch (e) {
        console.error('Error loading AI config:', e);
    }
}

// Save AI config to localStorage
function saveAIConfig() {
    try {
        localStorage.setItem('ai_config', JSON.stringify(aiConfig));
    } catch (e) {
        console.error('Error saving AI config:', e);
    }
}

// SRS Configuration (Anki-like intervals in minutes for demo)
const SRS_CONFIG = {
    new: { again: 1, hard: 5, good: 10, easy: 15 },
    learning: { again: 1, hard: 5, good: 10, easy: 30 },
    review: { again: 0.1, hard: 0.6, good: 1.0, easy: 1.5 },
    maxInterval: 60 * 24 * 30, // 30 days in minutes
};

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 AI Flashcards with SRS starting...');
    loadAIConfig();
    loadData();
    setupEventListeners();
    updateUI();
    updateDueCards();
    checkOllamaStatus();
});

// ==================== DATA MANAGEMENT ====================

function loadData() {
    try {
        const decksData = localStorage.getItem('flashcard_decks');
        decks = decksData ? JSON.parse(decksData) : [];
        
        const currentDeckId = localStorage.getItem('current_deck');
        if (currentDeckId && decks.length > 0) {
            currentDeck = decks.find(d => d.id === currentDeckId) || decks[0];
        } else if (decks.length > 0) {
            currentDeck = decks[0];
        }
        
        if (currentDeck) {
            const cardsData = localStorage.getItem(`deck_${currentDeck.id}_cards`);
            cards = cardsData ? JSON.parse(cardsData) : [];
            
            let updated = false;
            cards.forEach(card => {
                if (!card.srs) {
                    card.srs = initializeSRS();
                    updated = true;
                }
            });
            
            if (updated) saveData();
        } else {
            cards = [];
        }
        
        console.log(`Loaded ${decks.length} decks, ${cards.length} cards`);
    } catch (e) {
        console.error('Error loading data:', e);
        decks = [];
        cards = [];
    }
}

function saveData() {
    try {
        localStorage.setItem('flashcard_decks', JSON.stringify(decks));
        if (currentDeck) {
            localStorage.setItem('current_deck', currentDeck.id);
            localStorage.setItem(`deck_${currentDeck.id}_cards`, JSON.stringify(cards));
        }
    } catch (e) {
        console.error('Save error:', e);
    }
}

// ==================== OLLAMA AI FUNCTIONS ====================

async function checkOllamaStatus() {
    const statusElement = document.getElementById('aiStatus');
    const badgeElement = document.getElementById('aiStatusBadge');
    
    try {
        statusElement.innerHTML = '<i class="fas fa-circle" style="color: #f59e0b;"></i> Checking Ollama...';
        
        const response = await fetch(`${aiConfig.baseUrl}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.models && data.models.length > 0) {
                statusElement.innerHTML = '<i class="fas fa-circle" style="color: #10b981;"></i> Ollama: Ready';
                badgeElement.textContent = 'AI Ready';
                badgeElement.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                
                // Update model dropdown with available models
                updateModelDropdown(data.models);
                return true;
            }
        }
    } catch (error) {
        console.log('Ollama not available:', error);
        statusElement.innerHTML = '<i class="fas fa-circle" style="color: #ef4444;"></i> Ollama: Not running';
        badgeElement.textContent = 'AI Offline';
        badgeElement.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    }
    return false;
}

function updateModelDropdown(models) {
    const modelSelect = document.getElementById('aiModel');
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        if (model.name === aiConfig.model) {
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });
}

async function generateFlashcards() {
    const prompt = document.getElementById('aiInput').value.trim();
    if (!prompt) {
        showMessage('Please enter a topic for AI generation', 'error');
        return;
    }
    
    if (!currentDeck) {
        showMessage('Please create or select a deck first!', 'error');
        return;
    }
    
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = 'Generating flashcards with AI...';
    
    try {
        const aiCards = await callOllamaAPI(prompt);
        
        let addedCount = 0;
        aiCards.forEach(card => {
            if (card.question && card.answer) {
                const success = addCard({
                    question: card.question,
                    answer: card.answer,
                    tags: ['AI Generated', prompt.split(' ')[0]]
                });
                if (success) addedCount++;
            }
        });
        
        if (addedCount > 0) {
            showMessage(`✅ Generated ${addedCount} flashcards!`, 'success');
        } else {
            showMessage('⚠️ No valid flashcards found in AI response', 'error');
        }
        
    } catch (error) {
        console.error('AI generation error:', error);
        showMessage(`❌ AI generation failed: ${error.message}`, 'error');
        
        addCard({
            question: `About: ${prompt}`,
            answer: 'Could not generate AI response. You can edit this answer.',
            tags: ['Manual', 'Error']
        });
        
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('aiInput').value = '';
    }
}

async function callOllamaAPI(prompt) {
    // Parse card count range
    let cardCount = aiConfig.cardCount;
    if (cardCount.includes('-')) {
        const [min, max] = cardCount.split('-').map(n => parseInt(n));
        cardCount = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
        cardCount = parseInt(cardCount) || 5;
    }
    
    // Build the prompt using template
    const fullPrompt = aiConfig.promptTemplate
        .replace('{count}', cardCount)
        .replace('{topic}', prompt);
    
    const response = await fetch(`${aiConfig.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: aiConfig.model,
            system: aiConfig.systemPrompt,
            prompt: fullPrompt,
            stream: false,
            options: {
                temperature: parseFloat(aiConfig.temperature),
                num_predict: parseInt(aiConfig.maxTokens)
            }
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return parseAIResponse(data.response);
}

function parseAIResponse(text) {
    const cards = [];
    const lines = text.split('\n');
    let currentQuestion = '';
    let currentAnswer = '';
    let inAnswer = false;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.toLowerCase().startsWith('q:') || 
            trimmed.toLowerCase().startsWith('question:')) {
            
            if (currentQuestion && currentAnswer) {
                cards.push({
                    question: currentQuestion,
                    answer: currentAnswer.trim()
                });
            }
            
            currentQuestion = trimmed.replace(/^(q:|question:)\s*/i, '').trim();
            currentAnswer = '';
            inAnswer = false;
            
        } else if (trimmed.toLowerCase().startsWith('a:') || 
                   trimmed.toLowerCase().startsWith('answer:')) {
            
            currentAnswer = trimmed.replace(/^(a:|answer:)\s*/i, '').trim();
            inAnswer = true;
            
        } else if (inAnswer && trimmed) {
            currentAnswer += ' ' + trimmed;
        }
    }
    
    if (currentQuestion && currentAnswer) {
        cards.push({
            question: currentQuestion,
            answer: currentAnswer.trim()
        });
    }
    
    return cards;
}

// ==================== AI CONFIGURATION FUNCTIONS ====================

function openAIConfigModal() {
    // Populate form with current config
    document.getElementById('aiBaseUrl').value = aiConfig.baseUrl;
    document.getElementById('aiModel').value = aiConfig.model;
    document.getElementById('aiTemperature').value = aiConfig.temperature;
    document.getElementById('aiMaxTokens').value = aiConfig.maxTokens;
    document.getElementById('aiCardCount').value = aiConfig.cardCount;
    document.getElementById('aiPromptTemplate').value = aiConfig.promptTemplate;
    document.getElementById('aiSystemPrompt').value = aiConfig.systemPrompt;
    
    document.getElementById('aiConfigModal').classList.add('active');
}

function saveAIConfigFromModal() {
    // Update config from form
    aiConfig.baseUrl = document.getElementById('aiBaseUrl').value.trim();
    aiConfig.model = document.getElementById('aiModel').value;
    aiConfig.temperature = parseFloat(document.getElementById('aiTemperature').value);
    aiConfig.maxTokens = parseInt(document.getElementById('aiMaxTokens').value);
    aiConfig.cardCount = document.getElementById('aiCardCount').value;
    aiConfig.promptTemplate = document.getElementById('aiPromptTemplate').value;
    aiConfig.systemPrompt = document.getElementById('aiSystemPrompt').value;
    
    saveAIConfig();
    document.getElementById('aiConfigModal').classList.remove('active');
    showMessage('✅ AI settings saved!', 'success');
    checkOllamaStatus(); // Re-check status with new URL
}

function resetAIConfig() {
    if (confirm('Reset AI settings to defaults?')) {
        aiConfig = {
            baseUrl: 'http://localhost:11434',
            model: 'mistral',
            temperature: 0.7,
            maxTokens: 500,
            promptTemplate: 'Create {count} educational flashcards about: {topic}\n\nFormat each card as:\nQ: [question]\nA: [answer]\n\nMake the questions clear and the answers concise.',
            cardCount: '3-5',
            systemPrompt: 'You are a helpful assistant that creates educational flashcards. Make it simple. You can generate questions or cloze quizzes Where the answer of a flashcard is only a sentence, better if one word.'
        };
        saveAIConfig();
        openAIConfigModal(); // Refresh modal with defaults
        showMessage('🔄 AI settings reset to defaults', 'success');
    }
}

// ==================== SRS FUNCTIONS ====================

function initializeSRS() {
    return {
        status: 'new',
        interval: 0,
        ease: 2.5,
        nextReview: null,
        reviews: 0,
        lastResult: null,
        streak: 0,
        created: new Date().toISOString()
    };
}

function scheduleReview(card, rating) {
    const srs = card.srs;
    const now = new Date();
    
    srs.lastResult = rating;
    srs.reviews++;
    
    if (srs.status === 'new') {
        handleNewCardReview(srs, rating);
    } else if (srs.status === 'learning') {
        handleLearningReview(srs, rating);
    } else {
        handleReviewCard(srs, rating);
    }
    
    let intervalMinutes = srs.interval;
    srs.nextReview = new Date(now.getTime() + intervalMinutes * 60000).toISOString();
    
    if (rating === 'again') {
        srs.streak = 0;
    } else {
        srs.streak++;
    }
    
    return srs;
}

function handleNewCardReview(srs, rating) {
    const config = SRS_CONFIG.new;
    switch(rating) {
        case 'again': srs.interval = config.again; srs.status = 'learning'; break;
        case 'hard': srs.interval = config.hard; srs.status = 'learning'; break;
        case 'good': srs.interval = config.good; srs.status = 'review'; break;
        case 'easy': srs.interval = config.easy; srs.status = 'review'; srs.ease = Math.max(2.5, srs.ease + 0.15); break;
    }
}

function handleLearningReview(srs, rating) {
    const config = SRS_CONFIG.learning;
    switch(rating) {
        case 'again': srs.interval = config.again; srs.status = 'learning'; srs.ease = Math.max(1.3, srs.ease - 0.2); break;
        case 'hard': srs.interval = config.hard; srs.status = 'learning'; srs.ease = Math.max(1.3, srs.ease - 0.15); break;
        case 'good': srs.interval = config.good; srs.status = 'review'; break;
        case 'easy': srs.interval = config.easy; srs.status = 'review'; srs.ease = Math.min(3.0, srs.ease + 0.15); break;
    }
}

function handleReviewCard(srs, rating) {
    const config = SRS_CONFIG.review;
    switch(rating) {
        case 'again': srs.status = 'relearning'; srs.interval = Math.max(1, srs.interval * config.again); srs.ease = Math.max(1.3, srs.ease - 0.2); break;
        case 'hard': srs.interval = Math.max(srs.interval * config.hard, 5); srs.ease = Math.max(1.3, srs.ease - 0.15); break;
        case 'good': srs.interval = Math.max(srs.interval * config.good * srs.ease, 10); break;
        case 'easy': srs.interval = Math.max(srs.interval * config.easy * srs.ease, 15); srs.ease = Math.min(3.0, srs.ease + 0.15); break;
    }
    srs.interval = Math.min(srs.interval, SRS_CONFIG.maxInterval);
}

function getDueCards() {
    const now = new Date();
    return cards.filter(card => {
        if (card.srs.status === 'new') return true;
        if (!card.srs.nextReview) return true;
        const nextReview = new Date(card.srs.nextReview);
        return nextReview <= now;
    });
}

function getCardsByStatus(status) {
    return cards.filter(card => card.srs.status === status);
}

function updateDueCards() {
    const dueCards = getDueCards();
    const learningCards = getCardsByStatus('learning');
    const reviewCards = getCardsByStatus('review');
    
    if (document.getElementById('dueCards')) {
        document.getElementById('dueCards').textContent = dueCards.length;
        document.getElementById('dueBadge').textContent = dueCards.length;
        document.getElementById('learningCards').textContent = learningCards.length;
        document.getElementById('learningBadge').textContent = learningCards.length;
        document.getElementById('reviewCards').textContent = reviewCards.length;
        document.getElementById('reviewBadge').textContent = reviewCards.length;
    }
}

// ==================== CARD MANAGEMENT ====================

function createNewDeck() {
    const name = document.getElementById('deckNameInput').value.trim();
    if (!name) {
        alert('Please enter a deck name');
        return;
    }
    
    const description = document.getElementById('deckDescInput').value.trim();
    
    const newDeck = {
        id: 'deck_' + Date.now(),
        name: name,
        description: description,
        cardCount: 0,
        createdAt: new Date().toISOString()
    };
    
    decks.push(newDeck);
    currentDeck = newDeck;
    cards = [];
    currentCardIndex = 0;
    isFlipped = false;
    
    saveData();
    updateUI();
    updateDueCards();
    
    document.getElementById('newDeckModal').classList.remove('active');
    document.getElementById('deckNameInput').value = '';
    document.getElementById('deckDescInput').value = '';
    
    showMessage('🎉 Deck created!', 'success');
}

function selectDeck(deck) {
    currentDeck = deck;
    
    const cardsData = localStorage.getItem(`deck_${deck.id}_cards`);
    cards = cardsData ? JSON.parse(cardsData) : [];
    currentCardIndex = 0;
    isFlipped = false;
    
    document.getElementById('flashcard').classList.remove('flipped');
    if (document.getElementById('reviewButtons')) {
        document.getElementById('reviewButtons').style.display = 'none';
    }
    
    let updated = false;
    cards.forEach(card => {
        if (!card.srs) {
            card.srs = initializeSRS();
            updated = true;
        }
    });
    
    if (updated) saveData();
    
    saveData();
    updateUI();
    updateDueCards();
}

function addCard(cardData) {
    if (!currentDeck) {
        showMessage('Please select a deck first!', 'error');
        return false;
    }
    
    const newCard = {
        id: 'card_' + Date.now(),
        question: cardData.question.trim(),
        answer: cardData.answer.trim(),
        tags: cardData.tags || ['Manual'],
        createdAt: new Date().toISOString(),
        srs: initializeSRS()
    };
    
    cards.push(newCard);
    currentDeck.cardCount = cards.length;
    
    saveData();
    updateUI();
    updateDueCards();
    
    currentCardIndex = cards.length - 1;
    isFlipped = false;
    showCurrentCard();
    
    return true;
}

function showCurrentCard() {
    if (cards.length === 0) return;
    
    const card = cards[currentCardIndex];
    const flashcard = document.getElementById('flashcard');
    
    isFlipped = false;
    flashcard.classList.remove('flipped');
    if (document.getElementById('reviewButtons')) {
        document.getElementById('reviewButtons').style.display = 'none';
    }
    
    document.getElementById('cardQuestion').textContent = card.question;
    document.getElementById('cardAnswer').textContent = card.answer;
    
    const srs = card.srs;
    const statusEls = document.querySelectorAll('.card-status');
    const dueEls = document.querySelectorAll('.card-due-info');
    
    statusEls.forEach(el => {
        el.textContent = srs.status.charAt(0).toUpperCase() + srs.status.slice(1);
        el.className = 'card-status ' + srs.status;
    });
    
    if (srs.nextReview) {
        const nextReview = new Date(srs.nextReview);
        const now = new Date();
        const diff = nextReview - now;
        
        if (diff <= 0) {
            dueEls.forEach(el => {
                el.textContent = 'Due now';
                el.style.color = '#ef4444';
            });
        } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            if (hours > 0) {
                dueEls.forEach(el => {
                    el.textContent = `Due in ${hours}h ${minutes}m`;
                });
            } else {
                dueEls.forEach(el => {
                    el.textContent = `Due in ${minutes}m`;
                });
            }
        }
    } else {
        dueEls.forEach(el => {
            el.textContent = 'New card';
        });
    }
    
    const srsInfo = document.getElementById('srsInfo');
    if (srsInfo) {
        srsInfo.textContent = `${srs.status.toUpperCase()} | Streak: ${srs.streak} | Ease: ${srs.ease.toFixed(2)}`;
    }
    
    const tagsFront = document.getElementById('cardTagsFront');
    const tagsBack = document.getElementById('cardTagsBack');
    if (tagsFront && tagsBack) {
        tagsFront.innerHTML = '';
        tagsBack.innerHTML = '';
        
        if (card.tags && card.tags.length > 0) {
            card.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'tag';
                tagEl.textContent = tag;
                tagsFront.appendChild(tagEl.cloneNode(true));
                tagsBack.appendChild(tagEl.cloneNode(true));
            });
        }
    }
    
    if (document.getElementById('cardProgress')) {
        document.getElementById('cardProgress').textContent = 
            `Card ${currentCardIndex + 1} of ${cards.length}`;
    }
    
    const isDue = !srs.nextReview || new Date(srs.nextReview) <= new Date();
    if (srsInfo && (srs.status === 'new' || isDue)) {
        srsInfo.innerHTML += ' <span style="color: #ef4444;">(DUE)</span>';
    }
}

function flipCard() {
    const flashcard = document.getElementById('flashcard');
    isFlipped = !isFlipped;
    flashcard.classList.toggle('flipped');
    
    if (isFlipped) {
        document.getElementById('reviewButtons').style.display = 'flex';
    } else {
        document.getElementById('reviewButtons').style.display = 'none';
    }
}

function rateCard(rating) {
    if (cards.length === 0) return;
    
    const card = cards[currentCardIndex];
    scheduleReview(card, rating);
    saveData();
    updateDueCards();
    
    let feedback = '';
    switch(rating) {
        case 'again': feedback = 'Marked as "Don\'t Know" - will review again soon'; break;
        case 'hard': feedback = 'Marked as "Hard" - will review in a bit'; break;
        case 'good': feedback = 'Marked as "Good" - see you later'; break;
        case 'easy': feedback = 'Marked as "Easy" - see you much later!'; break;
    }
    
    showMessage(`✓ ${feedback}`, 'success');
    moveToNextCard();
}

function moveToNextCard() {
    if (cards.length === 0) return;
    
    const originalIndex = currentCardIndex;
    
    for (let i = 1; i <= cards.length; i++) {
        const nextIndex = (currentCardIndex + i) % cards.length;
        const nextCard = cards[nextIndex];
        
        if (nextCard.srs.status === 'new' || 
            !nextCard.srs.nextReview || 
            new Date(nextCard.srs.nextReview) <= new Date()) {
            
            currentCardIndex = nextIndex;
            break;
        }
    }
    
    if (currentCardIndex === originalIndex) {
        currentCardIndex = (currentCardIndex + 1) % cards.length;
    }
    
    isFlipped = false;
    document.getElementById('flashcard').classList.remove('flipped');
    document.getElementById('reviewButtons').style.display = 'none';
    showCurrentCard();
}

function deleteCurrentCard() {
    if (cards.length === 0) {
        showMessage('No cards to delete', 'error');
        return;
    }
    
    if (!confirm('Delete this flashcard?')) return;
    
    cards.splice(currentCardIndex, 1);
    currentDeck.cardCount = cards.length;
    
    if (currentCardIndex >= cards.length && cards.length > 0) {
        currentCardIndex = cards.length - 1;
    }
    
    saveData();
    updateUI();
    updateDueCards();
    
    if (cards.length > 0) {
        showCurrentCard();
    } else {
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('flashcardDisplay').style.display = 'none';
    }
    
    showMessage('🗑️ Card deleted', 'success');
}

// ==================== UI MANAGEMENT ====================

function updateUI() {
    const deckList = document.getElementById('deckList');
    if (!deckList) return;
    
    deckList.innerHTML = '';
    
    if (decks.length === 0) {
        deckList.innerHTML = `
            <div style="color: rgba(255,255,255,0.5); text-align: center; padding: 40px;">
                No decks yet. Create your first one!
            </div>
        `;
    } else {
        decks.forEach(deck => {
            const deckCardsData = localStorage.getItem(`deck_${deck.id}_cards`);
            const deckCards = deckCardsData ? JSON.parse(deckCardsData) : [];
            const dueCards = deckCards.filter(card => {
                if (!card.srs) return true;
                if (card.srs.status === 'new') return true;
                if (!card.srs.nextReview) return true;
                return new Date(card.srs.nextReview) <= new Date();
            }).length;
            
            const deckEl = document.createElement('div');
            deckEl.className = `deck-item ${currentDeck?.id === deck.id ? 'active' : ''}`;
            deckEl.innerHTML = `
                <div class="deck-header">
                    <div class="deck-name">${deck.name}</div>
                    <button class="deck-delete" data-id="${deck.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="deck-meta">
                    <span>${deck.cardCount || 0} cards</span>
                    <div>${formatDate(deck.createdAt)}</div>
                </div>
                ${dueCards > 0 ? `<div class="deck-stats-badge">${dueCards} due</div>` : ''}
            `;
            
            deckEl.addEventListener('click', (e) => {
                if (!e.target.closest('.deck-delete')) {
                    selectDeck(deck);
                }
            });
            
            const deleteBtn = deckEl.querySelector('.deck-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${deck.name}" and all its cards?`)) {
                    decks = decks.filter(d => d.id !== deck.id);
                    localStorage.removeItem(`deck_${deck.id}_cards`);
                    
                    if (currentDeck?.id === deck.id) {
                        currentDeck = decks.length > 0 ? decks[0] : null;
                        cards = [];
                    }
                    
                    saveData();
                    updateUI();
                    updateDueCards();
                    showMessage('🗑️ Deck deleted', 'success');
                }
            });
            
            deckList.appendChild(deckEl);
        });
    }
    
    const totalCards = decks.reduce((sum, deck) => sum + (deck.cardCount || 0), 0);
    if (document.getElementById('deckCount')) {
        document.getElementById('deckCount').textContent = decks.length;
        document.getElementById('totalCards').textContent = totalCards;
    }
    
    if (currentDeck) {
        document.getElementById('currentDeckTitle').textContent = currentDeck.name;
        
        if (cards.length > 0) {
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('flashcardDisplay').style.display = 'block';
            showCurrentCard();
        } else {
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('flashcardDisplay').style.display = 'none';
        }
    } else {
        document.getElementById('currentDeckTitle').textContent = 'Select a Deck';
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('flashcardDisplay').style.display = 'none';
    }
}

function openManualCardModal() {
    if (!currentDeck) {
        showMessage('Please create or select a deck first!', 'error');
        return;
    }
    
    document.getElementById('manualQuestion').value = '';
    document.getElementById('manualAnswer').value = '';
    document.getElementById('manualTags').value = '';
    
    document.getElementById('manualCardModal').classList.add('active');
    document.getElementById('manualQuestion').focus();
}

function saveManualCard() {
    const question = document.getElementById('manualQuestion').value.trim();
    const answer = document.getElementById('manualAnswer').value.trim();
    
    if (!question || !answer) {
        showMessage('Please enter both question and answer', 'error');
        return;
    }
    
    const tagsInput = document.getElementById('manualTags').value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : ['Manual'];
    
    const success = addCard({
        question: question,
        answer: answer,
        tags: tags
    });
    
    if (success) {
        document.getElementById('manualCardModal').classList.remove('active');
        showMessage('✅ Manual card added!', 'success');
    }
}

function focusAIInput() {
    if (!currentDeck) {
        showMessage('Please select a deck first!', 'error');
        return;
    }
    document.getElementById('aiInput').focus();
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // New deck
    document.getElementById('newDeckBtn').addEventListener('click', () => {
        document.getElementById('newDeckModal').classList.add('active');
        document.getElementById('deckNameInput').focus();
    });
    
    document.getElementById('createDeckBtn').addEventListener('click', createNewDeck);
    document.getElementById('cancelDeckBtn').addEventListener('click', () => {
        document.getElementById('newDeckModal').classList.remove('active');
    });
    document.getElementById('closeDeckModal').addEventListener('click', () => {
        document.getElementById('newDeckModal').classList.remove('active');
    });
    
    // Manual cards
    document.getElementById('manualCreateBtn').addEventListener('click', openManualCardModal);
    document.getElementById('addManualBtn').addEventListener('click', openManualCardModal);
    document.getElementById('saveManualCard').addEventListener('click', saveManualCard);
    document.getElementById('cancelManualCard').addEventListener('click', () => {
        document.getElementById('manualCardModal').classList.remove('active');
    });
    document.getElementById('closeManualModal').addEventListener('click', () => {
        document.getElementById('manualCardModal').classList.remove('active');
    });
    
    // AI generation
    document.getElementById('aiGenerateBtn').addEventListener('click', () => {
        if (!currentDeck) {
            showMessage('Please create a deck first!', 'error');
            return;
        }
        document.getElementById('aiInput').focus();
    });
    
    document.getElementById('aiGenerateFromHereBtn').addEventListener('click', focusAIInput);
    document.getElementById('sendBtn').addEventListener('click', generateFlashcards);
    
    document.getElementById('aiInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateFlashcards();
        }
    });
    
    // AI Configuration
    document.getElementById('aiConfigBtn').addEventListener('click', openAIConfigModal);
    document.getElementById('saveAIConfig').addEventListener('click', saveAIConfigFromModal);
    document.getElementById('resetAIConfig').addEventListener('click', resetAIConfig);
    document.getElementById('cancelAIConfig').addEventListener('click', () => {
        document.getElementById('aiConfigModal').classList.remove('active');
    });
    document.getElementById('closeAIConfigModal').addEventListener('click', () => {
        document.getElementById('aiConfigModal').classList.remove('active');
    });
    
    // Review buttons
    document.getElementById('againBtn').addEventListener('click', () => rateCard('again'));
    document.getElementById('hardBtn').addEventListener('click', () => rateCard('hard'));
    document.getElementById('goodBtn').addEventListener('click', () => rateCard('good'));
    document.getElementById('easyBtn').addEventListener('click', () => rateCard('easy'));
    
    // Card controls
    document.getElementById('flipBtn').addEventListener('click', flipCard);
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (cards.length === 0) return;
        currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length;
        isFlipped = false;
        document.getElementById('flashcard').classList.remove('flipped');
        document.getElementById('reviewButtons').style.display = 'none';
        showCurrentCard();
    });
    document.getElementById('nextBtn').addEventListener('click', moveToNextCard);
    document.getElementById('deleteCardBtn').addEventListener('click', deleteCurrentCard);
    
    // Click card to flip
    document.getElementById('flashcard').addEventListener('click', flipCard);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.matches('textarea, input')) return;
        
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                flipCard();
                break;
            case 'ArrowRight':
                if (cards.length > 0) moveToNextCard();
                break;
            case 'ArrowLeft':
                if (cards.length > 0) {
                    currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length;
                    isFlipped = false;
                    document.getElementById('flashcard').classList.remove('flipped');
                    document.getElementById('reviewButtons').style.display = 'none';
                    showCurrentCard();
                }
                break;
            case 'Digit1':
            case 'Numpad1':
                if (isFlipped && cards.length > 0) rateCard('again');
                break;
            case 'Digit2':
            case 'Numpad2':
                if (isFlipped && cards.length > 0) rateCard('hard');
                break;
            case 'Digit3':
            case 'Numpad3':
                if (isFlipped && cards.length > 0) rateCard('good');
                break;
            case 'Digit4':
            case 'Numpad4':
                if (isFlipped && cards.length > 0) rateCard('easy');
                break;
            case 'KeyM':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    openManualCardModal();
                }
                break;
        }
    });
    
    // Modal background click to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ==================== UTILITY FUNCTIONS ====================

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    } catch {
        return 'Recent';
    }
}

function showMessage(text, type = 'success') {
    const existing = document.querySelectorAll('.message');
    existing.forEach(el => el.remove());
    
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);
    
    setTimeout(() => {
        msg.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => msg.remove(), 300);
    }, 3000);
}

// Export functions for global access
window.generateFlashcards = generateFlashcards;
window.rateCard = rateCard;
window.flipCard = flipCard;
window.openManualCardModal = openManualCardModal;
window.saveManualCard = saveManualCard;
window.createNewDeck = createNewDeck;
window.openAIConfigModal = openAIConfigModal;
