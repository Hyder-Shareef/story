/**
 * ============================================================================
 * Stories Web Application — Core JavaScript (Vanilla ES6)
 * 
 * Features:
 * - Responsive Instagram / WhatsApp style Stories tray & full-screen viewer
 * - Add Story with validation and aspect-ratio canvas resizing (max 1080x1920)
 * - Base64 encoding via FileReader & Canvas
 * - LocalStorage persistence with Quota & corruption safety
 * - Strict 24-hour expiration lifecycle with periodic setInterval() cleanup
 * - 5-second segmented progress bar with pause-on-hold
 * - Tap zone navigation & mobile touch swipe gesture engine (Left/Right/Down)
 * - Keyboard navigation (Esc, Left/Right arrows, Space to pause)
 * - Viewed vs Unviewed state tracking with vibrant vs muted rings
 * ============================================================================
 */

(() => {
  'use strict';

  // ==========================================================================
  // Constants & Configuration
  // ==========================================================================
  const CONFIG = {
    STORAGE_KEY: 'ig_stories_app_data_v1',
    MAX_IMAGE_WIDTH: 1080,
    MAX_IMAGE_HEIGHT: 1920,
    JPEG_QUALITY: 0.82,
    STORY_DURATION_MS: 5000, // 5 seconds per story
    PROGRESS_INTERVAL_MS: 30, // 30ms updates for smooth 60fps-like progress
    EXPIRATION_MS: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    CLEANUP_INTERVAL_MS: 10 * 1000, // Check for expired stories every 10 seconds
    SWIPE_THRESHOLD_PX: 45, // Minimum swipe distance in pixels
    SWIPE_PULL_DOWN_PX: 75, // Minimum pull-down distance to close viewer
  };

  // ==========================================================================
  // Application State
  // ==========================================================================
  const state = {
    stories: [],
    currentStoryIndex: -1,
    isViewerOpen: false,
    isPaused: false,
    progressElapsedMs: 0,
    progressTimerId: null,
    cleanupTimerId: null,
    touchStartX: 0,
    touchStartY: 0,
    touchEndX: 0,
    touchEndY: 0,
    touchStartTime: 0,
    isHoldingDown: false,
    holdTimeoutId: null,
  };

  // ==========================================================================
  // DOM Elements Cache
  // ==========================================================================
  const DOM = {
    storiesContainer: document.getElementById('storiesContainer'),
    storyItemsList: document.getElementById('storyItemsList'),
    addStoryBtn: document.getElementById('addStoryBtn'),
    mobileAddStoryBtn: document.getElementById('mobileAddStoryBtn'),
    storyFileInput: document.getElementById('storyFileInput'),
    emptyStoryBanner: document.getElementById('emptyStoryBanner'),
    bannerUploadBtn: document.getElementById('bannerUploadBtn'),
    processingCanvas: document.getElementById('processingCanvas'),
    toastContainer: document.getElementById('toastContainer'),

    // Viewer Elements
    storyViewer: document.getElementById('storyViewer'),
    viewerBackdrop: document.getElementById('viewerBackdrop'),
    viewerContent: document.getElementById('viewerContent'),
    progressBarContainer: document.getElementById('progressBarContainer'),
    viewerUserAvatar: document.getElementById('viewerUserAvatar'),
    viewerUserName: document.getElementById('viewerUserName'),
    viewerTimestamp: document.getElementById('viewerTimestamp'),
    viewerPauseIndicator: document.getElementById('viewerPauseIndicator'),
    viewerDeleteBtn: document.getElementById('viewerDeleteBtn'),
    viewerCloseBtn: document.getElementById('viewerCloseBtn'),
    viewerImage: document.getElementById('viewerImage'),
    viewerLoadingSpinner: document.getElementById('viewerLoadingSpinner'),
    navZoneLeft: document.getElementById('navZoneLeft'),
    navZoneRight: document.getElementById('navZoneRight'),
    desktopPrevBtn: document.getElementById('desktopPrevBtn'),
    desktopNextBtn: document.getElementById('desktopNextBtn'),

    // Demo & Storage Controls
    demoControlsBtn: document.getElementById('demoControlsBtn'),
    demoControlsPanel: document.getElementById('demoControlsPanel'),
    closeDemoPanel: document.getElementById('closeDemoPanel'),
    loadSampleStoriesBtn: document.getElementById('loadSampleStoriesBtn'),
    expireOldestStoryBtn: document.getElementById('expireOldestStoryBtn'),
    markAllUnviewedBtn: document.getElementById('markAllUnviewedBtn'),
    clearAllStoriesBtn: document.getElementById('clearAllStoriesBtn'),
    storageUsageText: document.getElementById('storageUsageText'),
    storageBarFill: document.getElementById('storageBarFill'),
  };

  // ==========================================================================
  // Toast Notification System
  // ==========================================================================
  /**
   * Displays a temporary non-blocking alert toast.
   * @param {string} title - Heading
   * @param {string} message - Description
   * @param {'info'|'success'|'warning'|'error'} type - Style variant
   */
  const showToast = (title, message, type = 'info') => {
    if (!DOM.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    toast.innerHTML = `
      ${icons[type] || icons.info}
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  };

  // ==========================================================================
  // LocalStorage Service & Quota Management
  // ==========================================================================
  /**
   * Retrieves and safely parses stories from LocalStorage.
   * Handles empty storage and corrupted JSON gracefully.
   * @returns {Array<Object>}
   */
  const loadStoriesFromStorage = () => {
    try {
      const rawData = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!rawData) {
        return [];
      }
      const parsed = JSON.parse(rawData);
      if (!Array.isArray(parsed)) {
        console.warn('Storage data corrupted (not an array). Initializing empty stories list.');
        return [];
      }
      return parsed;
    } catch (error) {
      console.error('Failed to parse stories from localStorage:', error);
      showToast('Storage Notice', 'Corrupted story cache detected and reset safely.', 'warning');
      return [];
    }
  };

  /**
   * Saves stories array to LocalStorage.
   * Handles QuotaExceededError gracefully without crashing the app.
   * @param {Array<Object>} storiesToSave
   * @returns {boolean} Success status
   */
  const saveStoriesToStorage = (storiesToSave) => {
    try {
      const jsonString = JSON.stringify(storiesToSave);
      localStorage.setItem(CONFIG.STORAGE_KEY, jsonString);
      updateStorageMeter();
      return true;
    } catch (error) {
      console.error('LocalStorage write error:', error);
      const isQuotaError = 
        error.name === 'QuotaExceededError' || 
        error.code === 22 || 
        error.code === 1014 || 
        error.number === -2147024882;

      if (isQuotaError) {
        showToast(
          'Storage Limit Reached',
          'Your browser LocalStorage is full (~5MB). Please delete older stories or load fewer items.',
          'error'
        );
      } else {
        showToast('Storage Error', 'Unable to save story data to local cache.', 'error');
      }
      return false;
    }
  };

  /**
   * Calculates and updates the storage usage indicator.
   */
  const updateStorageMeter = () => {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY) || '';
      const bytes = new Blob([raw]).size;
      const kb = (bytes / 1024).toFixed(1);
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      const maxEstimatedMb = 5.0;
      const percentage = Math.min(100, Math.max(0, (bytes / (maxEstimatedMb * 1024 * 1024)) * 100));

      if (DOM.storageUsageText) {
        DOM.storageUsageText.textContent = `${kb} KB (${mb} MB / ~5 MB)`;
      }
      if (DOM.storageBarFill) {
        DOM.storageBarFill.style.width = `${percentage}%`;
        if (percentage > 85) {
          DOM.storageBarFill.style.background = 'var(--danger-color)';
        } else if (percentage > 60) {
          DOM.storageBarFill.style.background = 'var(--warning-color)';
        } else {
          DOM.storageBarFill.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
        }
      }
    } catch (e) {
      // Ignore meter calculation errors
    }
  };

  // ==========================================================================
  // 24-Hour Expiration Logic & Cleanup Engine
  // ==========================================================================
  /**
   * Evaluates all stories against the current timestamp.
   * Removes stories whose expiration timestamp has passed.
   * Updates LocalStorage and re-renders if expired stories were purged.
   * @param {boolean} silent - Whether to suppress toast notifications
   */
  const cleanExpiredStories = (silent = true) => {
    const now = Date.now();
    const initialCount = state.stories.length;

    // Filter stories that are still valid (expiresAt > now)
    const validStories = state.stories.filter((story) => {
      // Validate object integrity and expiration timestamp
      if (!story || typeof story.expiresAt !== 'number') return false;
      return story.expiresAt > now;
    });

    const expiredCount = initialCount - validStories.length;

    if (expiredCount > 0) {
      state.stories = validStories;
      saveStoriesToStorage(state.stories);
      renderStoriesTray();

      if (!silent) {
        showToast('Stories Expired', `${expiredCount} expired story was cleaned up.`, 'info');
      }

      // If viewer is open and currently displaying an expired story, navigate or close
      if (state.isViewerOpen) {
        if (state.stories.length === 0) {
          closeStoryViewer();
          showToast('Viewer Closed', 'The story you were viewing expired.', 'info');
        } else if (state.currentStoryIndex >= state.stories.length) {
          state.currentStoryIndex = state.stories.length - 1;
          renderViewerStory(state.currentStoryIndex);
        }
      }
    }
  };

  /**
   * Initializes periodic background cleanup using setInterval().
   */
  const startPeriodicCleanup = () => {
    if (state.cleanupTimerId) {
      clearInterval(state.cleanupTimerId);
    }
    state.cleanupTimerId = setInterval(() => {
      cleanExpiredStories(true);
    }, CONFIG.CLEANUP_INTERVAL_MS);
  };

  // ==========================================================================
  // Time Formatting Helpers
  // ==========================================================================
  /**
   * Formats relative time (e.g. "Just now", "5m ago", "3h ago").
   * @param {number} timestamp - Upload timestamp
   * @returns {string}
   */
  const formatRelativeTime = (timestamp) => {
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

    if (elapsedSeconds < 60) {
      return 'Just now';
    }
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m ago`;
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours}h ago`;
    }
    return '1d ago';
  };

  // ==========================================================================
  // Image Validation & Resizing Engine (Max 1080x1920 with Aspect Ratio)
  // ==========================================================================
  /**
   * Validates selected image file type.
   * @param {File} file
   * @returns {{isValid: boolean, error?: string}}
   */
  const validateImageFile = (file) => {
    if (!file) {
      return { isValid: false, error: 'No file selected.' };
    }

    const acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!acceptedTypes.includes(file.type.toLowerCase())) {
      return {
        isValid: false,
        error: 'Invalid file format. Please upload JPG, JPEG, PNG, or WebP images only.',
      };
    }

    // Safety check on raw file size before decoding (limit 25MB raw file)
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_FILE_BYTES) {
      return {
        isValid: false,
        error: 'Image is too large (max 25MB). Please choose a smaller image.',
      };
    }

    return { isValid: true };
  };

  /**
   * Resizes an image file to max 1080px width and max 1920px height
   * strictly preserving original aspect ratio and without distortion.
   * Converts the result to Base64 using HTML5 Canvas & FileReader.
   * @param {File} file
   * @returns {Promise<string>} Base64 image data URL
   */
  const processAndResizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error('Failed to read the image file.'));
      };

      reader.onload = (event) => {
        const rawBase64 = event.target.result;
        const img = new Image();

        img.onerror = () => {
          reject(new Error('Failed to load image for resizing.'));
        };

        img.onload = () => {
          let { width, height } = img;
          const { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, JPEG_QUALITY } = CONFIG;

          // Calculate aspect-ratio preserving dimensions
          if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
            const widthRatio = MAX_IMAGE_WIDTH / width;
            const heightRatio = MAX_IMAGE_HEIGHT / height;
            // Use the smaller ratio to fit inside 1080x1920 bounding box
            const scale = Math.min(widthRatio, heightRatio);

            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          // Use off-screen canvas to render resized image
          const canvas = DOM.processingCanvas || document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not initialize 2D canvas context.'));
            return;
          }

          // Clear canvas & draw smoothly
          ctx.clearRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to compressed Base64 JPEG data URL
          const resizedBase64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve(resizedBase64);
        };

        img.src = rawBase64;
      };

      reader.readAsDataURL(file);
    });
  };

  // ==========================================================================
  // Add Story Handler
  // ==========================================================================
  /**
   * Handles file selection from file input.
   * Validates, resizes, adds expiration, and persists story.
   * @param {Event} event
   */
  const handleStoryFileSelected = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // 1. Validate File
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      showToast('Validation Error', validation.error, 'error');
      DOM.storyFileInput.value = '';
      return;
    }

    showToast('Processing Story', 'Resizing and preparing your story...', 'info');

    try {
      // 2. Resize and Convert to Base64
      const resizedBase64 = await processAndResizeImage(file);

      // 3. Construct Story Model Object
      const now = Date.now();
      const newStory = {
        id: `story_${now}_${Math.random().toString(36).substring(2, 9)}`,
        imageData: resizedBase64,
        createdAt: now,
        expiresAt: now + CONFIG.EXPIRATION_MS, // Exactly 24 hours later
        username: 'You',
        viewed: false,
      };

      // 4. Append to Stories Array (Newest first)
      state.stories.unshift(newStory);

      // 5. Persist in LocalStorage
      const saved = saveStoriesToStorage(state.stories);
      if (saved) {
        showToast('Story Uploaded!', 'Your story is live for the next 24 hours.', 'success');
        renderStoriesTray();
      } else {
        // Rollback state if storage failed
        state.stories.shift();
      }
    } catch (err) {
      console.error('Error uploading story:', err);
      showToast('Upload Failed', err.message || 'Could not process the selected image.', 'error');
    } finally {
      // Clear file input value to allow re-uploading the same file
      DOM.storyFileInput.value = '';
    }
  };

  // ==========================================================================
  // UI Rendering: Horizontal Stories Section
  // ==========================================================================
  /**
   * Renders the stories tray at the top.
   * Displays circular thumbnails with gradient (unviewed) or muted (viewed) rings.
   */
  const renderStoriesTray = () => {
    if (!DOM.storyItemsList) return;

    // Clean expired stories before rendering
    const now = Date.now();
    state.stories = state.stories.filter((s) => s.expiresAt > now);

    DOM.storyItemsList.innerHTML = '';

    // Toggle empty banner state
    if (state.stories.length === 0) {
      if (DOM.emptyStoryBanner) DOM.emptyStoryBanner.classList.remove('hidden');
    } else {
      if (DOM.emptyStoryBanner) DOM.emptyStoryBanner.classList.add('hidden');
    }

    // Render each story item
    state.stories.forEach((story, index) => {
      const storyItem = document.createElement('div');
      storyItem.className = `story-item ${story.viewed ? 'viewed' : 'unviewed'}`;
      storyItem.setAttribute('role', 'button');
      storyItem.setAttribute('tabindex', '0');
      storyItem.setAttribute('aria-label', `Story by ${story.username}, ${formatRelativeTime(story.createdAt)}`);
      storyItem.dataset.id = story.id;
      storyItem.dataset.index = index;

      storyItem.innerHTML = `
        <div class="story-avatar-wrapper">
          <div class="story-avatar">
            <img src="${story.imageData}" alt="${story.username}'s Story" class="avatar-img" loading="lazy" />
          </div>
        </div>
        <span class="story-username">${story.username}</span>
      `;

      // Click to open viewer at this story
      storyItem.addEventListener('click', () => {
        openStoryViewer(index);
      });

      // Keyboard Accessibility (Enter or Space)
      storyItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openStoryViewer(index);
        }
      });

      DOM.storyItemsList.appendChild(storyItem);
    });

    updateStorageMeter();
  };

  // ==========================================================================
  // Full-Screen Story Viewer Engine
  // ==========================================================================
  /**
   * Opens the full-screen story viewer at a specific index.
   * @param {number} index
   */
  const openStoryViewer = (index) => {
    // Re-verify expiration before viewing
    cleanExpiredStories(true);

    if (state.stories.length === 0) {
      showToast('No Stories', 'There are no active stories to view.', 'info');
      return;
    }

    if (index < 0 || index >= state.stories.length) {
      index = 0;
    }

    state.isViewerOpen = true;
    state.currentStoryIndex = index;
    DOM.storyViewer.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Lock background scrolling

    // Bind event listeners for viewer interactions
    bindViewerEvents();

    // Render segmented progress bars and load target story
    renderProgressBarSegments();
    renderViewerStory(state.currentStoryIndex);
  };

  /**
   * Closes the full-screen viewer and cleans up all active timers and events.
   */
  const closeStoryViewer = () => {
    stopProgressTimer();
    state.isViewerOpen = false;
    state.isPaused = false;
    state.progressElapsedMs = 0;
    state.isHoldingDown = false;

    if (DOM.viewerPauseIndicator) {
      DOM.viewerPauseIndicator.classList.add('hidden');
    }

    DOM.storyViewer.classList.add('hidden');
    document.body.style.overflow = ''; // Restore background scrolling

    unbindViewerEvents();
    renderStoriesTray(); // Refresh tray to reflect newly viewed stories
  };

  /**
   * Generates progress bar segments matching the number of active stories.
   */
  const renderProgressBarSegments = () => {
    if (!DOM.progressBarContainer) return;
    DOM.progressBarContainer.innerHTML = '';

    state.stories.forEach((_, idx) => {
      const track = document.createElement('div');
      track.className = 'progress-bar-track';
      track.id = `progressTrack_${idx}`;

      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.id = `progressFill_${idx}`;

      track.appendChild(fill);
      DOM.progressBarContainer.appendChild(track);
    });
  };

  /**
   * Loads and displays the story at the specified index.
   * Starts the 5-second progress timer and marks story as viewed.
   * @param {number} index
   */
  const renderViewerStory = (index) => {
    // Strict bounds and expiration check
    if (index < 0 || index >= state.stories.length) {
      closeStoryViewer();
      return;
    }

    const currentStory = state.stories[index];
    const now = Date.now();

    // If current story has expired, remove and advance
    if (currentStory.expiresAt <= now) {
      cleanExpiredStories(false);
      return;
    }

    state.currentStoryIndex = index;
    state.progressElapsedMs = 0;

    // Mark current story as viewed and persist
    if (!currentStory.viewed) {
      currentStory.viewed = true;
      saveStoriesToStorage(state.stories);
    }

    // Update Header Metadata
    if (DOM.viewerUserName) DOM.viewerUserName.textContent = currentStory.username || 'Story';
    if (DOM.viewerTimestamp) DOM.viewerTimestamp.textContent = formatRelativeTime(currentStory.createdAt);
    if (DOM.viewerUserAvatar) DOM.viewerUserAvatar.src = currentStory.imageData;

    // Update Desktop Nav Arrows visibility
    if (DOM.desktopPrevBtn) DOM.desktopPrevBtn.style.opacity = index === 0 ? '0.4' : '1';
    if (DOM.desktopNextBtn) DOM.desktopNextBtn.style.opacity = index === state.stories.length - 1 ? '0.4' : '1';

    // Update Image with transition spinner
    if (DOM.viewerImage) {
      DOM.viewerImage.style.opacity = '0.3';
      if (DOM.viewerLoadingSpinner) DOM.viewerLoadingSpinner.classList.remove('hidden');

      DOM.viewerImage.onload = () => {
        DOM.viewerImage.style.opacity = '1';
        if (DOM.viewerLoadingSpinner) DOM.viewerLoadingSpinner.classList.add('hidden');
      };

      DOM.viewerImage.src = currentStory.imageData;
    }

    // Synchronize progress bar segments
    syncProgressBarsState(index);

    // Start 5-second progress animation
    startProgressTimer();
  };

  /**
   * Synchronizes progress fills: previous stories 100%, current 0%, future 0%.
   * @param {number} currentIndex
   */
  const syncProgressBarsState = (currentIndex) => {
    state.stories.forEach((_, idx) => {
      const fillEl = document.getElementById(`progressFill_${idx}`);
      if (!fillEl) return;

      if (idx < currentIndex) {
        fillEl.style.width = '100%';
      } else {
        fillEl.style.width = '0%';
      }
    });
  };

  /**
   * Starts the 5-second progress ticker for the current story.
   */
  const startProgressTimer = () => {
    stopProgressTimer();
    state.isPaused = false;

    if (DOM.viewerPauseIndicator) {
      DOM.viewerPauseIndicator.classList.add('hidden');
    }

    state.progressTimerId = setInterval(() => {
      if (state.isPaused) return;

      state.progressElapsedMs += CONFIG.PROGRESS_INTERVAL_MS;
      const progressPercent = Math.min(100, (state.progressElapsedMs / CONFIG.STORY_DURATION_MS) * 100);

      // Update current story's progress bar fill
      const currentFillEl = document.getElementById(`progressFill_${state.currentStoryIndex}`);
      if (currentFillEl) {
        currentFillEl.style.width = `${progressPercent}%`;
      }

      // Auto-advance when 5 seconds elapse
      if (state.progressElapsedMs >= CONFIG.STORY_DURATION_MS) {
        stopProgressTimer();
        goToNextStory();
      }
    }, CONFIG.PROGRESS_INTERVAL_MS);
  };

  /**
   * Stops the progress timer.
   */
  const stopProgressTimer = () => {
    if (state.progressTimerId) {
      clearInterval(state.progressTimerId);
      state.progressTimerId = null;
    }
  };

  /**
   * Pauses story progress (e.g., when user presses and holds screen).
   */
  const pauseStory = () => {
    if (!state.isViewerOpen) return;
    state.isPaused = true;
    if (DOM.viewerPauseIndicator) {
      DOM.viewerPauseIndicator.classList.remove('hidden');
    }
  };

  /**
   * Resumes story progress upon releasing screen.
   */
  const resumeStory = () => {
    if (!state.isViewerOpen) return;
    state.isPaused = false;
    if (DOM.viewerPauseIndicator) {
      DOM.viewerPauseIndicator.classList.add('hidden');
    }
  };

  /**
   * Moves to the next story. Closes viewer if on last story.
   */
  const goToNextStory = () => {
    stopProgressTimer();
    if (state.currentStoryIndex < state.stories.length - 1) {
      renderViewerStory(state.currentStoryIndex + 1);
    } else {
      closeStoryViewer();
    }
  };

  /**
   * Moves to the previous story. Restarts current story if on first.
   */
  const goToPrevStory = () => {
    stopProgressTimer();
    if (state.currentStoryIndex > 0) {
      renderViewerStory(state.currentStoryIndex - 1);
    } else {
      // Restart current story from 0%
      renderViewerStory(0);
    }
  };

  /**
   * Deletes the currently displayed story from state and LocalStorage.
   */
  const deleteCurrentStory = () => {
    if (!state.isViewerOpen || state.currentStoryIndex < 0) return;

    pauseStory();
    const confirmed = window.confirm('Are you sure you want to delete this story?');
    if (!confirmed) {
      resumeStory();
      return;
    }

    state.stories.splice(state.currentStoryIndex, 1);
    saveStoriesToStorage(state.stories);
    showToast('Story Deleted', 'The story was removed.', 'info');

    if (state.stories.length === 0) {
      closeStoryViewer();
    } else {
      // Re-render progress bars for updated count
      renderProgressBarSegments();
      if (state.currentStoryIndex >= state.stories.length) {
        state.currentStoryIndex = state.stories.length - 1;
      }
      renderViewerStory(state.currentStoryIndex);
    }
  };

  // ==========================================================================
  // Touch Swipe & Gesture Navigation
  // ==========================================================================
  /**
   * Handles touchstart on the viewer content.
   * Records initial coordinates and prepares pause-on-hold.
   * @param {TouchEvent} e
   */
  const handleTouchStart = (e) => {
    if (!state.isViewerOpen) return;
    const touch = e.touches[0];
    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
    state.touchEndX = touch.clientX;
    state.touchEndY = touch.clientY;
    state.touchStartTime = Date.now();

    // Trigger pause after 150ms hold
    state.holdTimeoutId = setTimeout(() => {
      state.isHoldingDown = true;
      pauseStory();
    }, 150);
  };

  /**
   * Handles touchmove on viewer content.
   * Updates coordinates and cancels hold if significant swipe begins.
   * @param {TouchEvent} e
   */
  const handleTouchMove = (e) => {
    if (!state.isViewerOpen) return;
    const touch = e.touches[0];
    state.touchEndX = touch.clientX;
    state.touchEndY = touch.clientY;

    const diffX = Math.abs(state.touchEndX - state.touchStartX);
    const diffY = Math.abs(state.touchEndY - state.touchStartY);

    // If movement exceeds 15px, it is a gesture, not a stationary hold
    if (diffX > 15 || diffY > 15) {
      if (state.holdTimeoutId) {
        clearTimeout(state.holdTimeoutId);
        state.holdTimeoutId = null;
      }
    }
  };

  /**
   * Handles touchend on viewer content.
   * Evaluates swipe gesture vs tap vs hold release.
   * @param {TouchEvent} e
   */
  const handleTouchEnd = (e) => {
    if (!state.isViewerOpen) return;

    if (state.holdTimeoutId) {
      clearTimeout(state.holdTimeoutId);
      state.holdTimeoutId = null;
    }

    if (state.isHoldingDown) {
      state.isHoldingDown = false;
      resumeStory();
    }

    const diffX = state.touchEndX - state.touchStartX;
    const diffY = state.touchEndY - state.touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    const duration = Date.now() - state.touchStartTime;

    // 1. Check for Vertical Pull Down to Close (Swipe Down)
    if (diffY > CONFIG.SWIPE_PULL_DOWN_PX && absDiffY > absDiffX * 1.3) {
      closeStoryViewer();
      return;
    }

    // 2. Check for Horizontal Swipe (Left / Right)
    if (absDiffX > CONFIG.SWIPE_THRESHOLD_PX && absDiffX > absDiffY) {
      if (diffX < 0) {
        // Swiped Left -> Next Story
        goToNextStory();
      } else {
        // Swiped Right -> Previous Story
        goToPrevStory();
      }
      return;
    }

    // 3. Otherwise, if it was a quick tap (< 250ms with < 10px drift), handle tap navigation
    if (duration < 250 && absDiffX < 12 && absDiffY < 12) {
      const viewerWidth = DOM.viewerContent.offsetWidth;
      const tapX = state.touchStartX - DOM.viewerContent.getBoundingClientRect().left;

      if (tapX < viewerWidth * 0.35) {
        goToPrevStory();
      } else {
        goToNextStory();
      }
    }
  };

  // ==========================================================================
  // Keyboard & Mouse Navigation Handlers
  // ==========================================================================
  /**
   * Handles keyboard shortcuts for story viewer.
   * @param {KeyboardEvent} e
   */
  const handleKeyDown = (e) => {
    if (!state.isViewerOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeStoryViewer();
        break;
      case 'ArrowRight':
        e.preventDefault();
        goToNextStory();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        goToPrevStory();
        break;
      case ' ':
        e.preventDefault();
        if (state.isPaused) {
          resumeStory();
        } else {
          pauseStory();
        }
        break;
      default:
        break;
    }
  };

  /**
   * Mouse down on media wrapper pauses progress.
   */
  const handleMouseDown = () => {
    if (state.isViewerOpen) pauseStory();
  };

  /**
   * Mouse up or leave on media wrapper resumes progress.
   */
  const handleMouseUp = () => {
    if (state.isViewerOpen) resumeStory();
  };

  /**
   * Binds viewer event listeners when opening.
   */
  const bindViewerEvents = () => {
    window.addEventListener('keydown', handleKeyDown);

    if (DOM.viewerContent) {
      DOM.viewerContent.addEventListener('touchstart', handleTouchStart, { passive: true });
      DOM.viewerContent.addEventListener('touchmove', handleTouchMove, { passive: true });
      DOM.viewerContent.addEventListener('touchend', handleTouchEnd, { passive: true });
      DOM.viewerContent.addEventListener('mousedown', handleMouseDown);
      DOM.viewerContent.addEventListener('mouseup', handleMouseUp);
      DOM.viewerContent.addEventListener('mouseleave', handleMouseUp);
    }
  };

  /**
   * Unbinds viewer event listeners when closing.
   */
  const unbindViewerEvents = () => {
    window.removeEventListener('keydown', handleKeyDown);

    if (DOM.viewerContent) {
      DOM.viewerContent.removeEventListener('touchstart', handleTouchStart);
      DOM.viewerContent.removeEventListener('touchmove', handleTouchMove);
      DOM.viewerContent.removeEventListener('touchend', handleTouchEnd);
      DOM.viewerContent.removeEventListener('mousedown', handleMouseDown);
      DOM.viewerContent.removeEventListener('mouseup', handleMouseUp);
      DOM.viewerContent.removeEventListener('mouseleave', handleMouseUp);
    }
  };

  // ==========================================================================
  // Sample Stories Generator (For Immediate Testing & Demo)
  // ==========================================================================
  /**
   * Generates high-quality SVG/Canvas sample stories so evaluators can test
   * immediately without hunting for local image files.
   */
  const loadSampleDemoStories = () => {
    const samples = [
      {
        title: 'Sunset in Santorini',
        user: 'traveler.alex',
        gradient: ['#f97316', '#db2777', '#4f46e5'],
        sunColor: '#fde047',
        timeOffsetMs: 15 * 60 * 1000, // 15 mins ago
      },
      {
        title: 'Cyberpunk Tokyo',
        user: 'neon_vibes',
        gradient: ['#09090b', '#3b0764', '#0284c7'],
        sunColor: '#ec4899',
        timeOffsetMs: 2 * 60 * 60 * 1000, // 2 hours ago
      },
      {
        title: 'Morning Matcha Brew',
        user: 'cafe_culture',
        gradient: ['#064e3b', '#047857', '#a7f3d0'],
        sunColor: '#fef08a',
        timeOffsetMs: 5 * 60 * 60 * 1000, // 5 hours ago
      },
      {
        title: 'Alpine Peak Sunrise',
        user: 'mountain_wanderer',
        gradient: ['#1e1b4b', '#4338ca', '#38bdf8'],
        sunColor: '#fb923c',
        timeOffsetMs: 12 * 60 * 60 * 1000, // 12 hours ago
      },
    ];

    const canvas = DOM.processingCanvas || document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    const now = Date.now();
    const createdStories = samples.map((sample, i) => {
      // Draw background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, sample.gradient[0]);
      grad.addColorStop(0.5, sample.gradient[1]);
      grad.addColorStop(1, sample.gradient[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Draw artistic sun/glow circle
      ctx.beginPath();
      ctx.arc(540, 850, 240, 0, Math.PI * 2);
      ctx.fillStyle = sample.sunColor;
      ctx.shadowColor = sample.sunColor;
      ctx.shadowBlur = 60;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw mountain silhouettes
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, 1920);
      ctx.lineTo(0, 1400);
      ctx.lineTo(350, 1100);
      ctx.lineTo(700, 1350);
      ctx.lineTo(1080, 1050);
      ctx.lineTo(1080, 1920);
      ctx.closePath();
      ctx.fill();

      // Draw stylized text overlay
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sample.title, 540, 1600);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '36px -apple-system, sans-serif';
      ctx.fillText(`@${sample.user} • 24h Story`, 540, 1670);

      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      const createdAt = now - sample.timeOffsetMs;

      return {
        id: `sample_${now}_${i}`,
        imageData: base64,
        createdAt: createdAt,
        expiresAt: createdAt + CONFIG.EXPIRATION_MS,
        username: sample.user,
        viewed: false,
      };
    });

    state.stories = [...createdStories, ...state.stories];
    saveStoriesToStorage(state.stories);
    renderStoriesTray();
    showToast('Demo Stories Loaded', 'Added 4 sample stories to explore.', 'success');
  };

  /**
   * Fast-forwards the oldest story's expiration to test the 24h cleanup.
   */
  const testExpireOldestStory = () => {
    if (state.stories.length === 0) {
      showToast('No Stories', 'Load sample stories or upload a photo first.', 'warning');
      return;
    }

    // Get the oldest story
    const oldestStory = state.stories.reduce((oldest, current) => 
      current.createdAt < oldest.createdAt ? current : oldest, state.stories[0]);

    // Force its expiration timestamp into the past
    oldestStory.expiresAt = Date.now() - 5000;
    saveStoriesToStorage(state.stories);

    showToast('Expiration Simulated', `Set expiration of "${oldestStory.username}" to past. Running cleanup...`, 'info');

    // Run cleanup
    cleanExpiredStories(false);
  };

  /**
   * Marks all stories as unviewed so evaluator can see vibrant rings again.
   */
  const resetAllViewedStatus = () => {
    state.stories.forEach((story) => {
      story.viewed = false;
    });
    saveStoriesToStorage(state.stories);
    renderStoriesTray();
    showToast('Status Reset', 'All stories marked as unviewed (vibrant ring).', 'success');
  };

  /**
   * Clears all stories and wipes storage.
   */
  const clearAllStories = () => {
    if (state.stories.length === 0) return;
    const confirmed = window.confirm('Clear all stories from memory and LocalStorage?');
    if (!confirmed) return;

    state.stories = [];
    saveStoriesToStorage([]);
    if (state.isViewerOpen) closeStoryViewer();
    renderStoriesTray();
    showToast('Cleared', 'All stories have been cleared.', 'info');
  };

  // ==========================================================================
  // Initialization & Global Event Listeners
  // ==========================================================================
  const init = () => {
    // 1. Load persisted stories from LocalStorage
    state.stories = loadStoriesFromStorage();

    // 2. Perform initial 24h expiration check
    cleanExpiredStories(true);

    // 3. Render Stories Section
    renderStoriesTray();

    // 4. Start periodic 24h expiration checker (every 10s)
    startPeriodicCleanup();

    // 5. Connect Add Story (+) button triggers
    const triggerFileInput = () => {
      if (DOM.storyFileInput) {
        DOM.storyFileInput.click();
      }
    };

    if (DOM.addStoryBtn) {
      DOM.addStoryBtn.addEventListener('click', triggerFileInput);
      DOM.addStoryBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerFileInput();
        }
      });
    }

    if (DOM.mobileAddStoryBtn) {
      DOM.mobileAddStoryBtn.addEventListener('click', triggerFileInput);
    }

    if (DOM.bannerUploadBtn) {
      DOM.bannerUploadBtn.addEventListener('click', triggerFileInput);
    }

    // 6. Connect File Input Change Listener
    if (DOM.storyFileInput) {
      DOM.storyFileInput.addEventListener('change', handleStoryFileSelected);
    }

    // 7. Connect Viewer Controls
    if (DOM.viewerCloseBtn) {
      DOM.viewerCloseBtn.addEventListener('click', closeStoryViewer);
    }

    if (DOM.viewerBackdrop) {
      DOM.viewerBackdrop.addEventListener('click', closeStoryViewer);
    }

    if (DOM.viewerDeleteBtn) {
      DOM.viewerDeleteBtn.addEventListener('click', deleteCurrentStory);
    }

    // Left and Right tap zones (Click Navigation)
    if (DOM.navZoneLeft) {
      DOM.navZoneLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        goToPrevStory();
      });
    }

    if (DOM.navZoneRight) {
      DOM.navZoneRight.addEventListener('click', (e) => {
        e.stopPropagation();
        goToNextStory();
      });
    }

    // Desktop Nav Arrow Buttons
    if (DOM.desktopPrevBtn) {
      DOM.desktopPrevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        goToPrevStory();
      });
    }

    if (DOM.desktopNextBtn) {
      DOM.desktopNextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        goToNextStory();
      });
    }

    // 8. Connect Demo & Testing Controls Panel
    if (DOM.demoControlsBtn && DOM.demoControlsPanel) {
      DOM.demoControlsBtn.addEventListener('click', () => {
        DOM.demoControlsPanel.classList.toggle('hidden');
      });
    }

    if (DOM.closeDemoPanel && DOM.demoControlsPanel) {
      DOM.closeDemoPanel.addEventListener('click', () => {
        DOM.demoControlsPanel.classList.add('hidden');
      });
    }

    if (DOM.loadSampleStoriesBtn) {
      DOM.loadSampleStoriesBtn.addEventListener('click', loadSampleDemoStories);
    }

    if (DOM.expireOldestStoryBtn) {
      DOM.expireOldestStoryBtn.addEventListener('click', testExpireOldestStory);
    }

    if (DOM.markAllUnviewedBtn) {
      DOM.markAllUnviewedBtn.addEventListener('click', resetAllViewedStatus);
    }

    if (DOM.clearAllStoriesBtn) {
      DOM.clearAllStoriesBtn.addEventListener('click', clearAllStories);
    }

    // If storage is completely fresh and empty on first visit, load sample stories automatically for instant delightful experience!
    if (state.stories.length === 0) {
      loadSampleDemoStories();
    }
  };

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

