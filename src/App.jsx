import { useState, useEffect } from 'react'
import './App.css'
import { config } from './config'

function App() {
  const [isActive, setIsActive] = useState(false);
  const [isRemoveMode, setIsRemoveMode] = useState(false);
  const [hasRemovedElements, setHasRemovedElements] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [isPersistent, setIsPersistent] = useState(false);
  const [opacity, setOpacity] = useState(0.75);

  // Check current state when popup opens
  useEffect(() => {
    const checkCurrentState = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'GET_STATES'
        });
        setIsActive(response.isActive);
        setIsRemoveMode(response.isRemoveMode);
        setHasRemovedElements(response.hasRemovedElements);
        setCanUndo(response.canUndo);
      } catch (error) {
        // If we can't communicate with the content script, states are inactive
        console.log('Content script not ready yet');
        setIsActive(false);
        setIsRemoveMode(false);
        setHasRemovedElements(false);
        setCanUndo(false);
      }
    };

    checkCurrentState();
  }, []); // Run once when popup opens

  const toggleFocusMode = async () => {
    try {
      // Get the current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Try to send a message first to check if content script is already injected
      try {
        const newState = !isActive;
        if (newState && isRemoveMode) {
          setIsRemoveMode(false); // Disable remove mode if enabling focus mode
        }
        await chrome.tabs.sendMessage(tab.id, {
          action: 'TOGGLE_FOCUS_MODE',
          enable: newState,
          opacity: opacity
        });
        setIsActive(newState);
      } catch (error) {
        // If message fails, inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/content-scripts/focus.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['/content-scripts/focus.css']
        });

        // Try sending the message again
        const newState = !isActive;
        if (newState && isRemoveMode) {
          setIsRemoveMode(false);
        }
        await chrome.tabs.sendMessage(tab.id, {
          action: 'TOGGLE_FOCUS_MODE',
          enable: newState,
          opacity: opacity
        });
        setIsActive(newState);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Cannot enable focus mode on this page. Please refresh and try again.');
    }
  };

  const toggleRemoveMode = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      try {
        const newState = !isRemoveMode;
        if (newState && isActive) {
          setIsActive(false); // Disable focus mode if enabling remove mode
        }
        await chrome.tabs.sendMessage(tab.id, {
          action: 'TOGGLE_REMOVE_MODE',
          enable: newState
        });
        setIsRemoveMode(newState);
      } catch (error) {
        // If message fails, inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/content-scripts/focus.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['/content-scripts/focus.css']
        });

        // Try sending the message again
        const newState = !isRemoveMode;
        if (newState && isActive) {
          setIsActive(false);
        }
        await chrome.tabs.sendMessage(tab.id, {
          action: 'TOGGLE_REMOVE_MODE',
          enable: newState
        });
        setIsRemoveMode(newState);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Cannot enable remove mode on this page. Please refresh and try again.');
    }
  };

  const handleOpacityChange = async (event) => {
    const newOpacity = parseFloat(event.target.value);
    setOpacity(newOpacity);
    
    // If focus mode is active, update the opacity
    if (isActive) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'UPDATE_OPACITY',
          opacity: newOpacity
        });
      } catch (error) {
        console.error('Error updating opacity:', error);
      }
    }
  };

  const handleReset = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'RESET_REMOVALS'
      });
      setHasRemovedElements(false);
    } catch (error) {
      console.error('Error resetting removals:', error);
      alert('Failed to reset removed elements. Please refresh the page.');
    }
  };

  const handleUndo = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'UNDO_REMOVAL'
      });
      setHasRemovedElements(response.hasRemovedElements);
      setCanUndo(response.canUndo);
    } catch (error) {
      console.error('Error undoing removal:', error);
      alert('Failed to undo removal. Please refresh the page.');
    }
  };

  const handlePersistenceChange = (event) => {
    setIsPersistent(event.target.checked);
  };

  const renderPremiumFeature = (feature, children) => {
    if (config.isSubscribed) {
      return children;
    }
    return (
      <div 
        className="premium-lock"
        data-premium-tooltip={`Try ${config.premiumFeatures[feature].name} with Pro`}
      >
        <div className="premium-feature locked">
          {children}
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <div className="app-header">
        <img src="/focusExt-FinalLogo.png" alt="Focus Web" className="app-logo" />
        <div className="app-title-container">
          <h1 className="app-title">Focus Web</h1>
          <p className="app-subtitle">Remove All Webpage Distractions</p>
        </div>
      </div>

      <div className="section focus-section">
        <button 
          onClick={toggleFocusMode}
          className={`mode-toggle focus-toggle ${isActive ? 'active' : ''}`}
          disabled={isRemoveMode}
        >
          {isActive ? 'Disable' : 'Enable'} Focus Mode
        </button>

        <div className={`opacity-control ${isActive ? 'visible' : ''}`}>
          {config.isSubscribed ? (
            <>
              <label htmlFor="opacity-slider">
                Darkness
                <span className="premium-badge">Pro</span>
              </label>
              <input
                id="opacity-slider"
                type="range"
                min="0.1"
                max="0.95"
                step="0.05"
                value={opacity}
                onChange={handleOpacityChange}
                className="opacity-slider"
                disabled={!isActive}
              />
              <span className="opacity-value">{Math.round(opacity * 100)}%</span>
            </>
          ) : (
            <div 
              className="premium-lock"
              data-premium-tooltip={`Try ${config.premiumFeatures['darknessControl'].name} with Pro`}
            >
              <div className="premium-feature locked">
                <label htmlFor="opacity-slider">
                  Darkness
                  <span className="premium-badge">Pro</span>
                </label>
                <input
                  id="opacity-slider"
                  type="range"
                  min="0.1"
                  max="0.95"
                  step="0.05"
                  value={opacity}
                  onChange={handleOpacityChange}
                  className="opacity-slider"
                  disabled={true}
                />
                <span className="opacity-value">{Math.round(opacity * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="section remove-section">
        <button 
          onClick={toggleRemoveMode}
          className={`mode-toggle remove-toggle ${isRemoveMode ? 'active' : ''}`}
          disabled={isActive}
        >
          {isRemoveMode ? 'Stop Removing' : 'Remove Elements'}
        </button>

        {hasRemovedElements && (
          <div className="removal-controls">
            {renderPremiumFeature('undoRemoval',
              <button 
                onClick={handleUndo}
                className="mode-toggle undo-button"
                disabled={!canUndo || isActive || isRemoveMode}
              >
                Undo
                <span className="premium-badge">Pro</span>
              </button>
            )}
            <button 
              onClick={handleReset}
              className="mode-toggle reset-button"
              disabled={isActive || isRemoveMode}
            >
              Reset Removals
            </button>
          </div>
        )}

        {hasRemovedElements && (
          <div className="persistence-control">
            <label className="persistence-label disabled">
              <input
                type="checkbox"
                disabled
                className="persistence-checkbox"
              />
              <span>Remember changes for this site</span>
              <span className="coming-soon-badge">Coming Soon</span>
            </label>
          </div>
        )}
      </div>

      <div className="app-footer">
        © 2025 FocusWeb Extension. All rights reserved.
      </div>
    </div>
  )
}

export default App
