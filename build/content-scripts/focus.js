// Use an IIFE to avoid global scope pollution
(function() {
    console.log('Focus Mode content script initialized');

    let isActive = false;
    let isRemoveMode = false;
    let isFocused = false;
    let currentHoveredElement = null;
    let focusedElement = null;
    let overlay = null;
    let currentOpacity = 0.75;
    let removedElements = new Set();
    let removalHistory = []; // Track removal history for undo

    // Function to handle mouse movement and highlight elements
    function handleMouseMove(event) {
        if ((!isActive && !isRemoveMode) || isFocused) return;

        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || element === currentHoveredElement) return;

        // Remove highlight from previous element
        if (currentHoveredElement) {
            currentHoveredElement.classList.remove('focus-hover', 'remove-hover');
        }

        // Add appropriate highlight to current element
        if (isActive) {
            element.classList.add('focus-hover');
        } else if (isRemoveMode) {
            element.classList.add('remove-hover');
        }
        currentHoveredElement = element;
    }

    // Function to prevent default behaviors in remove mode
    function preventDefaults(event) {
        if (isRemoveMode) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    // Function to handle element selection
    function handleClick(event) {
        if ((!isActive && !isRemoveMode) || isFocused) return;
        
        event.preventDefault();
        event.stopPropagation();

        if (!currentHoveredElement) return;

        console.log('Click handled:', { isActive, isRemoveMode, element: currentHoveredElement });

        if (isActive) {
            // Create the focus effect
            createFocusEffect(currentHoveredElement);
        } else if (isRemoveMode) {
            // Remove the element
            removeElement(currentHoveredElement);
        }
    }

    // Function to remove an element
    function removeElement(element) {
        console.log('Removing element:', element);
        
        // Add to removed elements set and history
        removedElements.add(element);
        removalHistory.push(element);
        
        // Apply removal styles
        element.classList.add('removed-element');
        
        // Remove hover highlight
        element.classList.remove('remove-hover');
        currentHoveredElement = null;
    }

    // Function to undo last removal
    function undoLastRemoval() {
        if (removalHistory.length === 0) return false;
        
        const lastElement = removalHistory.pop();
        if (lastElement) {
            lastElement.classList.remove('removed-element');
            removedElements.delete(lastElement);
        }
        
        return removedElements.size > 0; // Return if there are still removed elements
    }

    // Function to restore all removed elements
    function restoreRemovedElements() {
        console.log('Restoring all removed elements');
        removedElements.forEach(element => {
            element.classList.remove('removed-element');
        });
        removedElements.clear();
        removalHistory = []; // Clear history
    }

    // Function to create focus effect
    function createFocusEffect(element) {
        // Remove any existing focus effects
        removeFocusEffect();

        // Set focused state
        isFocused = true;
        focusedElement = element;

        // Create single overlay
        overlay = document.createElement('div');
        overlay.className = 'focus-overlay';
        
        // Get element position
        const rect = element.getBoundingClientRect();
        
        // Calculate the clip path values
        const clipPath = `polygon(
            0% 0%,
            100% 0%,
            100% 100%,
            0% 100%,
            0% ${rect.top}px,
            ${rect.left}px ${rect.top}px,
            ${rect.left}px ${rect.bottom}px,
            ${rect.right}px ${rect.bottom}px,
            ${rect.right}px ${rect.top}px,
            0% ${rect.top}px
        )`;

        // Apply styles
        overlay.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, ${currentOpacity});
            z-index: 2147483645;
            clip-path: ${clipPath};
            pointer-events: none;
        `;

        document.body.appendChild(overlay);

        // Add focus class to the element
        element.classList.add('focus-element');

        // Add click handler to exit focus mode
        document.addEventListener('click', handleFocusExit);
    }

    // Function to update overlay opacity
    function updateOverlayOpacity(newOpacity) {
        currentOpacity = newOpacity;
        if (overlay) {
            overlay.style.background = `rgba(0, 0, 0, ${currentOpacity})`;
        }
    }

    // Function to remove focus effect
    function removeFocusEffect() {
        // Reset focused state
        isFocused = false;
        focusedElement = null;

        // Remove overlay
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        
        // Remove focus class from any elements
        document.querySelectorAll('.focus-element').forEach(el => el.classList.remove('focus-element'));
        
        // Remove hover class from current element
        if (currentHoveredElement) {
            currentHoveredElement.classList.remove('focus-hover', 'remove-hover');
            currentHoveredElement = null;
        }

        // Remove click handler
        document.removeEventListener('click', handleFocusExit);
    }

    // Handle click outside focused element
    function handleFocusExit(event) {
        const focusedElement = document.querySelector('.focus-element');
        if (focusedElement && !focusedElement.contains(event.target)) {
            removeFocusEffect();
            // Re-enable hover detection
            if (isActive) {
                enableHoverDetection();
            }
        }
    }

    // Function to enable hover detection
    function enableHoverDetection() {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('click', handleClick, true); // Changed to capture phase
        if (isRemoveMode) {
            // Add capture phase listeners for preventing default behaviors
            document.addEventListener('mousedown', preventDefaults, true);
        }
    }

    // Function to disable hover detection
    function disableHoverDetection() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true); // Changed to match enableHoverDetection
        document.removeEventListener('mousedown', preventDefaults, true);
        if (currentHoveredElement) {
            currentHoveredElement.classList.remove('focus-hover', 'remove-hover');
            currentHoveredElement = null;
        }
    }

    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Received message:', request);
        
        if (request.action === 'GET_STATES') {
            sendResponse({ 
                isActive,
                isRemoveMode,
                hasRemovedElements: removedElements.size > 0,
                canUndo: removalHistory.length > 0
            });
            return true;
        }
        
        if (request.action === 'TOGGLE_FOCUS_MODE') {
            if (request.enable) {
                isActive = true;
                isRemoveMode = false;
                if (request.opacity !== undefined) {
                    currentOpacity = request.opacity;
                }
                enableHoverDetection();
            } else {
                isActive = false;
                removeFocusEffect();
                disableHoverDetection();
            }
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'TOGGLE_REMOVE_MODE') {
            if (request.enable) {
                isRemoveMode = true;
                isActive = false;
                removeFocusEffect();
                enableHoverDetection();
            } else {
                isRemoveMode = false;
                disableHoverDetection();
            }
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'UNDO_REMOVAL') {
            const hasRemainingRemovals = undoLastRemoval();
            sendResponse({ 
                success: true,
                hasRemovedElements: hasRemainingRemovals,
                canUndo: removalHistory.length > 0
            });
            return true;
        }

        if (request.action === 'RESET_REMOVALS') {
            restoreRemovedElements();
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'UPDATE_OPACITY') {
            updateOverlayOpacity(request.opacity);
            sendResponse({ success: true });
            return true;
        }
    });
})(); 