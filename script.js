// ==================== AI FLASHCARDS - WORKS ON ANY STATIC HOSTING ====================

// Global state
let decks = JSON.parse(localStorage.getItem('flashcard_decks')) || [];
let currentDeck = localStorage.getItem('current_deck') ? 
    decks.find(d => d.id === localStorage.getItem('current_deck')) : 
    (decks.length > 0 ? decks[0] : null);
let cards = currentDeck ? 
    JSON.parse(localStorage.getItem(`deck_${currentDeck.id}_cards`) || '[]') : [];
let currentCardIndex = 0;
let isFlipped = false;

// DOM Elements
const elements = {
    deckList: document.getElementById('deckList'),
    currentDeckTitle: document.getElementById('currentDeckTitle'),
    deckStats: document.getElementById('deckStats'),
    emptyState: document.getElementById('emptyState'),
    flashcardContainer: document.getElementById('flashcardContainer'),
    cardQuestion: document.getElementById('cardQuestion'),
    cardAnswer: document.getElementById('cardAnswer'),
    cardTags: document.getElementById('cardTags'),
    progress: document.getElementById('progress'),
    aiInput: document.getElementById('aiInput'),
    sendBtn: document.getElementById('sendBtn'),
    ollamaStatus: document.getElementById('ollamaStatus'),
    loading: document.getElementById('loading'),
    newDeckBtn: document.getElementById('newDeckBtn'),
    deckModal: document.getElementById('deckModal'),
    deckNameInput: document.getElementById('deckNameInput'),
    createDeckBtn: document.getElementById('createDeckBtn'),
    cancelDeckBtn: document.getElementById('cancelDeckBtn'),
    manualCreateBtn: document.getElementById('manualCreateBtn'),
    cardModal: document.getElementById('cardModal'),
    manualQuestion: document.getElementById('manualQuestion'),
    manualAnswer: document.getElementById('manualAnswer'),
    manualTags: document.getElementById('manualTags'),
    saveCardBtn: document.getElementById('saveCardBtn'),
    cancelCardBtn: document.getElementById('cancelCardBtn'),
    aiGenerateBtn: document.getElementById('aiGenerateBtn'),
    flipBtn: document.getElementById('flipBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    deleteBtn: document.getElementById('deleteBtn')
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 AI Flashcards starting...');
    checkOllamaConnection();
    updateUI();
    setupEventListeners();
});

// Check if Ollama is running on user's local machine
async function checkOllamaConnection() {
    const statusEl = elements.ollamaStatus;
    if (!statusEl) return;
    
    statusEl.innerHTML = '<i class="fas fa-circle" style="color: #f59e0b;"></i> Checking Ollama...';
    
    // Try multiple times (Ollama might be starting)
    for (let i = 0; i < 3; i++) {
        try {
            // Try the tags endpoint first
            const response = await fetch('http://localhost:11434/api/tags', {
                mode: 'no-cors', // This will work even with CORS issues
                cache: 'no-cache',
                timeout: 2000
            });
            
            // If we get here, Ollama is running
            statusEl.innerHTML = '<i class="fas fa-circle" style="color: #10b981;"></i> Ollama: Connected ✓';
            statusEl.style.color = '#10b981';
            return true;
            
        } catch (error) {
            console.log(`Attempt ${i + 1}: Ollama check failed`);
            
            // Try the generate endpoint as fallback
            try {
                const genResponse = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'phi4-mini',
                        prompt: 'test',
                        stream: false
                    })
                });
                
                statusEl.innerHTML = '<i class="fas fa-circle" style="color: #10b981;"></i> Ollama: Connected ✓';
                return true;
                
            } catch (genError) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    
    // Ollama not running
    statusEl.innerHTML = '<i class="fas fa-circle" style="color: #ef4444;"></i> Ollama: Not running';
    statusEl.style.color = '#ef4444';
    
    // Show instructions
    showMessage('⚠️ Ollama not found. Please run: ollama serve', 'warning');
    return false;
}

// ==================== AI GENERATION ====================
async function generateWithAI() {
    const prompt = elements.aiInput.value.trim();
    if (!prompt) {
        alert('Please enter a topic');
        return;
    }
    
    if (!currentDeck) {
        alert('Please select or create a deck first');
        return;
    }
    
    showLoading(true);
    
    try {
        // Try multiple models in order of preference
        const models = ['phi4-mini', 'phi', 'mistral', 'llama2', 'tinyllama'];
        let response = null;
        let usedModel = null;
        
        for (const model of models) {
            try {
                console.log(`Trying model: ${model}`);
                
                const fetchResponse = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        prompt: `Create 2-3 educational flashcards about: ${prompt}. 
                                Format EXACTLY like this:
                                Q: What is photosynthesis?
                                A: The process plants use to convert sunlight into energy.
                                
                                Q: Another question?
                                A: Another answer.`,
                        stream: false,
                        options: {
                            temperature: 0.7,
                            max_tokens: 500
                        }
                    })
                });
                
                if (fetchResponse.ok) {
                    response = await fetchResponse.json();
                    usedModel = model;
                    break;
                }
            } catch (e) {
                console.log(`Model ${model} failed:`, e.message);
                continue;
            }
        }
        
        if (!response) {
            throw new Error('No working model found');
        }
        
        console.log(`✅ Generated with ${usedModel}:`, response.response.substring(0, 100) + '...');
        
        // Parse the response into cards
        const newCards = parseAICards(response.response, prompt);
        
        // Add cards to deck
        let addedCount = 0;
        for (const card of newCards) {
            if (card.question && card.answer) {
                addCard(card.question, card.answer, ['AI Generated']);
                addedCount++;
            }
        }
        
        if (addedCount > 0) {
            showMessage(`✅ Generated ${addedCount} flashcards!`);
            elements.aiInput.value = '';
        } else {
            // Fallback - create one card from the response
            addCard(
                `About: ${prompt}`,
                response.response.substring(0, 200),
                ['AI Generated']
            );
            showMessage('✅ Generated 1 flashcard');
        }
        
    } catch (error) {
        console.error('AI generation error:', error);
        
        // Ultimate fallback - create a simple card
        addCard(
            `Tell me about ${prompt}`,
            'AI generation failed. Please check if Ollama is running with: ollama serve',
            ['Manual']
        );
        
        showMessage('⚠️ AI failed - added manual card');
    } finally {
        showLoading(false);
        updateUI();
    }
}

// Parse AI response into structured cards
function parseAICards(text, originalPrompt) {
    const cards = [];
    const lines = text.split('\n');
    let currentQ = '';
    let currentA = '';
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.toLowerCase().startsWith('q:')) {
            if (currentQ && currentA) {
                cards.push({ question: currentQ, answer: currentA });
            }
            currentQ = trimmed.substring(2).trim();
            currentA = '';
            
        } else if (trimmed.toLowerCase().startsWith('a:')) {
            currentA = trimmed.substring(2).trim();
            
        } else if (trimmed && currentQ && !currentA) {
            // If we have a question but no answer yet, this might be the answer
            currentA = trimmed;
        }
    }
    
    if (currentQ && currentA) {
        cards.push({ question: currentQ, answer: currentA });
    }
    
    // If no cards parsed, create a simple one
    if (cards.length === 0) {
        cards.push({
            question: `Explain: ${originalPrompt}`,
            answer: text.substring(0, 200)
        });
    }
    
    return cards;
}

// ==================== DECK MANAGEMENT ====================
function createNewDeck() {
    const name = elements.deckNameInput.value.trim();
    if (!name) {
        alert('Please enter a deck name');
        return;
    }
    
    const newDeck = {
        id: 'deck_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: name,
        cardCount: 0,
        createdAt: new Date().toISOString()
    };
    
    decks.push(newDeck);
    currentDeck = newDeck;
    cards = [];
    
    saveData();
    closeModal('deckModal');
    updateUI();
    showMessage(`✅ Deck "${name}" created`);
}

function selectDeck(deck) {
    currentDeck = deck;
    cards = JSON.parse(localStorage.getItem(`deck_${deck.id}_cards`) || '[]');
    currentCardIndex = 0;
    isFlipped = false;
    
    localStorage.setItem('current_deck', deck.id);
    updateUI();
}

function deleteDeck(deckId) {
    if (!confirm('Delete this deck and all its cards?')) return;
    
    decks = decks.filter(d => d.id !== deckId);
    localStorage.removeItem(`deck_${deckId}_cards`);
    
    if (currentDeck?.id === deckId) {
        currentDeck = decks.length > 0 ? decks[0] : null;
        cards = currentDeck ? 
            JSON.parse(localStorage.getItem(`deck_${currentDeck.id}_cards`) || '[]') : [];
        currentCardIndex = 0;
    }
    
    saveData();
    updateUI();
    showMessage('✅ Deck deleted');
}

// ==================== CARD MANAGEMENT ====================
function addCard(question, answer, tags = ['Manual']) {
    if (!currentDeck) {
        alert('Please select a deck first');
        return false;
    }
    
    const newCard = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        question: question,
        answer: answer,
        tags: tags,
        createdAt: new Date().toISOString()
    };
    
    cards.push(newCard);
    currentDeck.cardCount = cards.length;
    
    saveData();
    updateUI();
    
    // Show the new card
    currentCardIndex = cards.length - 1;
    showCurrentCard();
    
    return true;
}

function saveManualCard() {
    const question = elements.manualQuestion.value.trim();
    const answer = elements.manualAnswer.value.trim();
    
    if (!question || !answer) {
        alert('Please enter both question and answer');
        return;
    }
    
    const tagsInput = elements.manualTags.value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : ['Manual'];
    
    addCard(question, answer, tags);
    closeModal('cardModal');
    
    elements.manualQuestion.value = '';
    elements.manualAnswer.value = '';
    elements.manualTags.value = '';
}

function deleteCurrentCard() {
    if (!currentDeck || cards.length === 0) return;
    
    if (!confirm('Delete this card?')) return;
    
    cards.splice(currentCardIndex, 1);
    currentDeck.cardCount = cards.length;
    
    if (currentCardIndex >= cards.length) {
        currentCardIndex = Math.max(0, cards.length - 1);
    }
    
    saveData();
    updateUI();
    showMessage('✅ Card deleted');
}

// ==================== UI FUNCTIONS ====================
function updateUI() {
    // Update deck list
    renderDeckList();
    
    // Update header
    if (currentDeck) {
        elements.currentDeckTitle.textContent = currentDeck.name;
        elements.deckStats.textContent = `${cards.length} cards`;
        
        if (cards.length > 0) {
            elements.emptyState.style.display = 'none';
            elements.flashcardContainer.style.display = 'block';
            showCurrentCard();
        } else {
            elements.emptyState.style.display = 'block';
            elements.flashcardContainer.style.display = 'none';
        }
    } else {
        elements.currentDeckTitle.textContent = 'No Deck Selected';
        elements.deckStats.textContent = '0 cards';
        elements.emptyState.style.display = 'block';
        elements.flashcardContainer.style.display = 'none';
    }
}

function renderDeckList() {
    if (!elements.deckList) return;
    
    elements.deckList.innerHTML = '';
    
    if (decks.length === 0) {
        elements.deckList.innerHTML = '<div style="color: #6b7280; padding: 10px;">No decks yet</div>';
        return;
    }
    
    decks.forEach(deck => {
        const deckEl = document.createElement('div');
        deckEl.className = `deck-item ${currentDeck?.id === deck.id ? 'active' : ''}`;
        deckEl.innerHTML = `
            <div class="deck-name">${deck.name}</div>
            <div class="deck-meta">
                <span>${deck.cardCount || 0} cards</span>
                <button class="deck-delete" data-id="${deck.id}">×</button>
            </div>
        `;
        
        deckEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('deck-delete')) {
                selectDeck(deck);
            }
        });
        
        const deleteBtn = deckEl.querySelector('.deck-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDeck(deck.id);
        });
        
        elements.deckList.appendChild(deckEl);
    });
}

function showCurrentCard() {
    if (cards.length === 0 || !currentDeck) return;
    
    const card = cards[currentCardIndex];
    if (!card) return;
    
    elements.cardQuestion.textContent = card.question;
    elements.cardAnswer.textContent = card.answer;
    elements.cardAnswer.style.display = isFlipped ? 'block' : 'none';
    
    // Show tags
    elements.cardTags.innerHTML = '';
    if (card.tags && card.tags.length > 0) {
        card.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            elements.cardTags.appendChild(tagEl);
        });
    }
    
    elements.progress.textContent = `Card ${currentCardIndex + 1} of ${cards.length}`;
}

// ==================== UTILITIES ====================
function saveData() {
    localStorage.setItem('flashcard_decks', JSON.stringify(decks));
    if (currentDeck) {
        localStorage.setItem(`deck_${currentDeck.id}_cards`, JSON.stringify(cards));
        localStorage.setItem('current_deck', currentDeck.id);
    }
}

function showLoading(show) {
    if (elements.loading) {
        elements.loading.style.display = show ? 'flex' : 'none';
    }
}

function showMessage(text, type = 'success') {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);
    
    setTimeout(() => {
        msg.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => msg.remove(), 300);
    }, 3000);
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // New deck
    elements.newDeckBtn?.addEventListener('click', () => openModal('deckModal'));
    elements.createDeckBtn?.addEventListener('click', createNewDeck);
    elements.cancelDeckBtn?.addEventListener('click', () => closeModal('deckModal'));
    
    // Manual card
    elements.manualCreateBtn?.addEventListener('click', () => openModal('cardModal'));
    elements.saveCardBtn?.addEventListener('click', saveManualCard);
    elements.cancelCardBtn?.addEventListener('click', () => closeModal('cardModal'));
    
    // AI generation
    elements.aiGenerateBtn?.addEventListener('click', generateWithAI);
    elements.sendBtn?.addEventListener('click', generateWithAI);
    
    elements.aiInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateWithAI();
        }
    });
    
    // Card controls
    elements.flipBtn?.addEventListener('click', () => {
        isFlipped = !isFlipped;
        showCurrentCard();
    });
    
    elements.prevBtn?.addEventListener('click', () => {
        if (cards.length === 0) return;
        currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length;
        isFlipped = false;
        showCurrentCard();
    });
    
    elements.nextBtn?.addEventListener('click', () => {
        if (cards.length === 0) return;
        currentCardIndex = (currentCardIndex + 1) % cards.length;
        isFlipped = false;
        showCurrentCard();
    });
    
    elements.deleteBtn?.addEventListener('click', deleteCurrentCard);
    
    // Click card to flip
    const flashcard = document.querySelector('.flashcard');
    flashcard?.addEventListener('click', () => {
        isFlipped = !isFlipped;
        showCurrentCard();
    });
    
    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ==================== DEBUG FUNCTIONS ====================
window.debug = function() {
    console.log('=== DEBUG INFO ===');
    console.log('Decks:', decks);
    console.log('Current Deck:', currentDeck);
    console.log('Cards:', cards);
    console.log('Current Index:', currentCardIndex);
    console.log('LocalStorage:', {
        decks: localStorage.getItem('flashcard_decks'),
        currentDeck: localStorage.getItem('current_deck')
    });
};

window.testOllama = async function() {
    console.log('Testing Ollama connection...');
    await checkOllamaConnection();
};

window.addTestCard = function() {
    addCard('Test Question?', 'Test Answer!', ['Test']);
};
