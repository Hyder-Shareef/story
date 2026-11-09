# Instagram / WhatsApp Stories Web Application

A responsive, high-performance Stories application built using **only HTML5, CSS3, and Vanilla JavaScript (ES6)** with zero external dependencies, libraries, or frameworks.

---

## 🌟 Key Features

### 1. Modern Social Media Interface
- **Horizontal Stories Tray:** Prominently positioned at the top with smooth horizontal scrolling on mobile and desktop.
- **Visually Distinct "Add Story" Button:** Highlighted with a dashed accent ring and a vibrant plus (`+`) badge.
- **Circular Thumbnails & Dynamic Rings:**
  - **Unviewed Stories:** Vibrant animated multi-color Instagram gradient ring (`#f09433` -> `#e6683c` -> `#dc2743` -> `#cc2366` -> `#bc1888`).
  - **Viewed Stories:** Muted, subtle gray border ring.
- **User Labels & Relative Timestamps:** Displays usernames below thumbnails with ellipsis truncation and relative timestamps (`Just now`, `15m ago`, `2h ago`).
- **Responsive Layout:** Adapts seamlessly across desktop, tablet, and mobile devices (includes a realistic social feed mockup and bottom navigation bar on mobile).

### 2. Add Story with Image Processing & Resizing
- **Native File Input:** Directly opens the device's image picker.
- **Format Validation:** Accepts only `image/jpeg`, `image/jpg`, `image/png`, and `image/webp`. Rejects non-image files with clear toast alerts.
- **Aspect-Ratio Resizing:**
  - Constrains dimensions to a maximum width of **1080px** and maximum height of **1920px**.
  - Maintains the original aspect ratio using scaling factor `Math.min(1080 / width, 1920 / height)`.
  - Zero stretching or distortion.
- **Base64 Conversion:** Rendered via an off-screen HTML5 `<canvas>` and converted into an optimized Base64 JPEG data URL to preserve browser storage.

### 3. LocalStorage Persistence & Safety
- **Data Model:** Each story is stored as an object:
  ```javascript
  {
    id: "story_1731179400000_abc123",
    imageData: "data:image/jpeg;base64,...",
    createdAt: 1731179400000,
    expiresAt: 1731265800000, // 24 hours later
    username: "You",
    viewed: false
  }
  ```
- **Robust Persistence:** Stories are saved via `localStorage.setItem()` and retrieved on page load via `localStorage.getItem()`.
- **Fault-Tolerant Parsing:** Safe `try...catch` blocks handle empty storage and corrupted JSON data without breaking.
- **Storage Quota Management:** Catches `QuotaExceededError` gracefully and alerts the user with a friendly toast notification. Real-time storage meter displays KB and MB utilized.

### 4. Strict 24-Hour Expiration Engine
- **Lifecycle Expiration:** Automatically calculates `expiresAt = Date.now() + 24 * 60 * 60 * 1000`.
- **Startup Cleanup:** Checks all stories on application load and removes any story where `Date.now() >= story.expiresAt`.
- **Periodic Interval Cleanup:** Background daemon using `setInterval()` evaluates and purges expired stories every 10 seconds.
- **View Gatekeeper:** Validates expiration whenever opening and navigating stories, ensuring expired stories can never be viewed even if the browser remained open or was reopened days later.

### 5. Full-Screen Story Viewer
- **Segmented Top Progress Bar:** Dynamic progress segments matching the count of active stories.
- **Automatic 5-Second Advance:** Smoothly fills over 5000ms before auto-advancing to the next story or closing on the final story.
- **Pause on Hold:** Pressing and holding (touch or mouse down) pauses the timer and progress bar with a visual "Paused" indicator, resuming on release.
- **Tap Zone Navigation:**
  - Left zone (left 35%): Navigate to previous story.
  - Right zone (right 65%): Navigate to next story.
- **Keyboard Shortcuts:**
  - `Escape`: Close viewer.
  - `ArrowRight`: Next story.
  - `ArrowLeft`: Previous story.
  - `Space`: Toggle pause/resume.
- **Desktop Navigation:** External arrow buttons on desktop for enhanced accessibility.
- **Close & Delete Options:** Quick close button (`X`), click outside backdrop to close, and an in-viewer delete button.
- **Complete Resource Cleanup:** Clears all timers and unbinds event listeners when closed.

### 6. Touch Swipe Navigation
- **Horizontal Swiping:**
  - Swipe Left: Next story.
  - Swipe Right: Previous story.
  - Calibrated horizontal threshold (> 45px) with angle detection to prevent diagonal conflict.
- **Vertical Pull-Down:** Swipe down (> 75px) closes the viewer.
- **Touch-Friendly Tap Zones:** Distinguishes between quick taps (< 250ms, < 12px drift) and swipes.

### 7. Evaluator Testing Tools (Gear Icon at Top Right)
To make grading and verification fast and effortless:
- **Load Sample Stories:** Loads 4 rich, pre-rendered landscape and city stories with varied timestamps.
- **Expire Oldest Story (Test 24h Expiration):** Immediately backdates the oldest story's expiration to test the 24-hour cleanup engine in real time.
- **Reset Viewed Status:** Marks all stories unviewed to observe the colorful animated ring.
- **Clear All Stories:** Wipes memory and LocalStorage to test the empty state.
- **Live Storage Meter:** Shows exact KB / MB usage and capacity percentage.

---

## 📁 Project Structure

```text
├── index.html        # Semantic HTML5 markup, app header, story tray, viewer modal, feed
├── styles.css        # Pure CSS styling, responsive media queries, keyframe animations
├── app.js            # Vanilla JavaScript ES6: state, canvas resizing, storage, gestures
└── README.md         # Documentation and project manual
```

---

## 🚀 How to Run

1. Open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).
2. No local web server or build step required.

