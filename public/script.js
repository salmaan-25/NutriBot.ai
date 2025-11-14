// --- Configuration ---
const CHAT_API_ENDPOINT = 'http://localhost:3000/api/chat';
const MAX_RETRIES = 5;

// In-memory chat history (transferred to the server for each request)
let chatHistory = [];

// --- Utility Functions ---

/**
 * Retries a fetch request with exponential backoff on failure.
 */
async function fetchWithRetry(url, options, retries = 0) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (retries < MAX_RETRIES) {
            const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s...
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries + 1);
        }
        throw error;
    }
}

/**
 * Displays a message bubble in the chat window.
 */
function displayMessage(text, isUser, sources = []) {
    const chatWindow = document.getElementById('chat-window');
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble p-3 rounded-xl shadow mt-2 ${isUser ? 'user-message' : 'bot-message'}`;
    bubble.innerHTML = isUser ? text : text.replace(/\n/g, '<br>');

    messageWrapper.appendChild(bubble);

    if (sources.length > 0) {
        const sourceContainer = document.createElement('div');
        sourceContainer.className = 'text-xs text-gray-500 mt-1 max-w-sm ml-10'; // Added margin for alignment
        const links = sources.map((s, index) =>
            `<a href="${s.uri}" target="_blank" class="hover:underline text-emerald-600 block" title="${s.title}">Source ${index + 1}: ${s.title}</a>`
        ).join('');
        sourceContainer.innerHTML = 'Grounded Sources:<br>' + links;
        messageWrapper.appendChild(sourceContainer);
    }

    chatWindow.appendChild(messageWrapper);
    chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll to bottom
}

// --- Main Chat Logic ---

/**
 * Handles sending a message to the backend.
 */
window.sendMessage = async function() {
    const inputElement = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const loadingSpinner = document.getElementById('loading-spinner');
    const userQuery = inputElement.value.trim();

    if (!userQuery) return;

    // 1. Update UI and disable input
    displayMessage(userQuery, true);
    inputElement.value = '';
    inputElement.disabled = true;
    sendButton.disabled = true;
    sendButton.querySelector('#send-text').classList.add('hidden');
    loadingSpinner.classList.remove('hidden');

    // 2. Add user message to history
    chatHistory.push({ role: "user", parts: [{ text: userQuery }] });

    try {
        // 3. Call the Node.js backend
        const result = await fetchWithRetry(CHAT_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: chatHistory })
        });

        const { text: botText, sources } = result;
        
        // 4. Add bot message to history (for next turn context)
        chatHistory.push({ role: "model", parts: [{ text: botText }] });

        // 5. Display the bot's response
        displayMessage(botText, false, sources);

    } catch (error) {
        console.error("Error communicating with Node.js server:", error);
        // Fallback message for user
        displayMessage("An error occurred while communicating with the server. Please check if the Node.js server is running (http://localhost:3000).", false);
    } finally {
        // 6. Restore UI state
        inputElement.disabled = false;
        sendButton.disabled = false;
        sendButton.querySelector('#send-text').classList.remove('hidden');
        loadingSpinner.classList.add('hidden');
        inputElement.focus();
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    // Initial check for enabling the send button (in case text is pre-filled, though unlikely)
    document.getElementById('send-button').disabled = document.getElementById('user-input').value.trim() === '';

    // Enable button when input has text
    document.getElementById('user-input').addEventListener('input', (e) => {
        document.getElementById('send-button').disabled = e.target.value.trim() === '';
    });

    // Allow sending message with Enter key
    document.getElementById('user-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !document.getElementById('send-button').disabled) {
            window.sendMessage();
        }
    });
});

/* ---------- Sidebar toggle + Quick Action glue ---------- */
(function () {
  // Ensure DOM exists (script appended to end of script.js so usually DOM is ready)
  const sidebar = document.querySelector('.sidebar');
  const topbarInner = document.querySelector('.topbar-inner');

  if (!sidebar || !topbarInner) {
    // If structure is different, silently exit (no error).
    return;
  }

  // create hamburger toggle in topbar (if not already present)
  if (!document.getElementById('sidebar-toggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'sidebar-toggle';
    toggle.className = 'hamburger';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.innerHTML = '☰'; // simple icon, replace with svg if you like
    // place as first child of topbar-inner for visibility
    topbarInner.insertBefore(toggle, topbarInner.firstChild);

    // add backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    // open / close functions
    function openSidebar() {
      sidebar.classList.add('sidebar-open');
      backdrop.classList.add('visible');
      toggle.setAttribute('aria-pressed', 'true');
      // prevent body scroll while open
      document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
      sidebar.classList.remove('sidebar-open');
      backdrop.classList.remove('visible');
      toggle.setAttribute('aria-pressed', 'false');
      document.body.style.overflow = '';
    }

    // initialize: if small screen, close it; else leave visible (desktop)
    if (window.innerWidth <= 980) closeSidebar();

    toggle.addEventListener('click', function () {
      if (sidebar.classList.contains('sidebar-open')) closeSidebar();
      else openSidebar();
    });

    backdrop.addEventListener('click', closeSidebar);

    // on resize, if moving to desktop ensure sidebar visible and body scrolling restored
    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) {
        // force visible state for desktop
        sidebar.classList.remove('sidebar-open');
        backdrop.classList.remove('visible');
        document.body.style.overflow = '';
      } else {
        // mobile: keep closed until user opens
        sidebar.classList.remove('sidebar-open');
        backdrop.classList.remove('visible');
      }
    });
  }

  // ---- Quick action buttons: fill input + (optionally) send ----
  // Finds .qa-btn elements (existing in your sidebar) and adds click handlers.
  const qaButtons = Array.from(document.querySelectorAll('.qa-btn'));
  qaButtons.forEach(btn => {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      const q = (btn.textContent || btn.innerText || '').trim();
      if (!q) return;

      const input = document.getElementById('user-input');
      if (!input) return;

      // put text in input
      input.value = q;
      input.focus();

      // If you want auto-send, call your existing sendMessage() function if present.
      // If sendMessage does not exist in your project, the click will just populate input.
      if (typeof sendMessage === 'function') {
        // small delay so input gets updated visually before send
        setTimeout(() => {
          try { sendMessage(); } catch (err) { console.error('sendMessage() error:', err); }
        }, 140);
      } else {
        // If your project listens to Enter key or a different handler,
        // dispatch a KeyboardEvent (Enter) as a fallback:
        const evEnter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' });
        input.dispatchEvent(evEnter);
      }

      // close sidebar automatically on small screens
      if (window.innerWidth <= 980) {
        const backdropEl = document.getElementById('sidebar-backdrop');
        sidebar.classList.remove('sidebar-open');
        if (backdropEl) backdropEl.classList.remove('visible');
        document.body.style.overflow = '';
      }
    });
  });
})();
