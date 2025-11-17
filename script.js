// Local video files from /vids directory
// Each entry is an object with both mp4 and webm sources
const GITHUB_RAW_BASE = 'https://github.com/rockenman1234/kafka/raw/main/vids/';
// WebM-only playlist. Ensure your WebM files use an audio codec Safari supports (e.g., Opus in recent iOS versions).
const videoFiles = [
    {
        webm: GITHUB_RAW_BASE + 'KAFKA1.webm',
        description: 'A man walks into a career fair, looking for a job. As he approaches the booth, he is greeted by a representative who has no interest in hiring him.'
    },
    {
        webm: GITHUB_RAW_BASE + 'KAFKA2.webm',
        description: 'A woman goes to see her college counselor to discuss her future plans. The counselor is unhelpful and dismissive, leaving the woman feeling lost and uncertain.'
    },
    {
        webm: GITHUB_RAW_BASE + 'KAFKA4.webm',
        description: 'A classroom of students is working, but one student is sure he has meet his friends in real life before.'
    },
    {
        webm: GITHUB_RAW_BASE + 'die-woodys.webm',
        description: 'Fichtls Lied by Die Woodys is a novelty German folk-pop song that became infamous on the internet for its quirky, exaggerated performance style and its almost surreal, earworm-like melody. Performed by a fictional “forest family” band, the song features intentionally kitschy vocals, playful yodel-inspired harmonies, and brightly cheerful instrumentation that leans heavily into comedic absurdity. Its lyrics revolve around a lighthearted, childlike celebration of the forest and its characters, embodying an over-the-top gemütlich (cozy) vibe that borders on parody.'
    },
    {
        webm: GITHUB_RAW_BASE + 'KAFKA3.webm',
        description: 'A young man walks into work hoping to make it home, but he finds himself transforming into a giant beast instead.'
    },
    {
        webm: GITHUB_RAW_BASE + 'kafka-edit.webm',
        description: 'Franz Kafka was a German-speaking Bohemian novelist and short story writer, widely regarded as one of the major figures of 20th-century literature. His work, which fuses elements of realism and the fantastic, typically features isolated protagonists facing bizarre or surrealistic predicaments and incomprehensible social-bureaucratic powers. The term "Kafkaesque" has entered the English language to describe situations reminiscent of his writing, characterized by nightmarish complexity, absurdity, and a sense of helplessness in the face of an oppressive and illogical system.'
    },
    {
        webm: GITHUB_RAW_BASE + 'yodel.webm',
        description: 'Performed by Franzl Lang, known as the "Yodel King," this traditional Alpine yodeling piece showcases his exceptional vocal range and skill. The song features rapid shifts between chest voice and head voice, characteristic of yodeling, set against a backdrop of folk instrumentation that evokes the mountainous regions of Austria and Switzerland.'
    },
    {
        webm: GITHUB_RAW_BASE + 'holzhacker.webm',
        description: 'A group of German woodcutters singing a traditional folk song while chopping wood in an auditorium. The performance combines rhythmic chopping sounds with harmonious vocals, creating a lively and engaging atmosphere that celebrates camaraderie and hard work.'
    },
    // Add more video file objects as needed
];

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array]; // Create a copy
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Randomize the channel order
const shuffledVideoFiles = shuffleArray(videoFiles);

let currentChannel = 0;
let isMuted = true; // Start muted by default
let volumeLevel = 50;
let videoElement = null;
// Track whether we are in the middle of a channel change so we don't force-loop a video that's being replaced
let channelChanging = false;
let volumeTimeout = null;
let backgroundInterval = null;
let staticAudio = null;
let audioContext = null;
let analyser = null;
let audioSource = null; // MediaElementSource for video audio
let videoGainNode = null; // Gain node to control volume cross-browser (esp. iOS)
let animationFrameId = null;
let infoButtonClicks = 0; // Track info button clicks for easter egg
let wakeLock = null; // Screen Wake Lock API sentinel
let keepAliveInterval = null; // Interval to keep video playing as fallback
let noSleepVideo = null; // Hidden video for older iOS versions (pre-16.4) workaround
let noSleepEnabled = false;
let wakeLockSupported = false; // Track if Wake Lock API is available

// Detect iOS for platform-specific handling (modern approach without deprecated platform property)
const isIOS = (() => {
    const ua = navigator.userAgent;
    // Check for iPhone, iPad, iPod in user agent
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // Check for iPad Pro in iPadOS 13+ which identifies as Mac
    // Use maxTouchPoints to detect touch-capable devices
    if (ua.includes('Mac') && navigator.maxTouchPoints > 1) return true;
    return false;
})();
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Log device info for debugging
console.log('Device info:', {
    isIOS,
    isSafari,
    wakeLockAvailable: 'wakeLock' in navigator,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent
});

// iOS-specific warning message
if (isIOS) {
    console.log('%c⚠ iOS DETECTED', 'background: #ff9500; color: white; font-size: 14px; padding: 4px 8px; border-radius: 4px;');
    console.log('%cIMPORTANT: Audio MUST remain unmuted and playing to keep screen awake on iOS!', 'color: #ff9500; font-weight: bold;');
    console.log('%cThe app will aggressively monitor and maintain audio playback.', 'color: #666;');
}

// Mouse tracking for dynamic background shading
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

// Ensure audio is unlocked on iOS by resuming AudioContext and replaying media within a user gesture
async function ensureAudioUnlocked() {
    // Only use Web Audio API on iOS - it causes issues on desktop
    if (isIOS) {
        try {
            // Resume or create AudioContext if needed
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
                console.log('AudioContext resumed');
            }

            // Lazily create the media element audio graph only when we actually need audible playback
            setupVideoAudioGraph();
        } catch (e) {
            console.log('AudioContext resume failed or unsupported:', e);
        }
    }

    // For media elements started muted, iOS often requires an explicit play() inside the gesture that unmutes
    if (videoElement) {
        try {
            videoElement.muted = false;
            // Set a minimum non-zero volume for iOS to consider it audible
            videoElement.volume = Math.max(volumeLevel / 100, 0.01);
            const p = videoElement.play();
            if (p && typeof p.then === 'function') {
                await p;
            }
            console.log('Video playback ensured after unmute');
        } catch (err) {
            console.log('Failed to ensure video playback after unmute:', err);
        }
    }
}

function setupVideoAudioGraph() {
    // Only use Web Audio API on iOS - it causes issues on desktop
    if (!isIOS) return;
    
    if (!videoElement || !audioContext) return;
    try {
        if (!audioSource) {
            audioSource = audioContext.createMediaElementSource(videoElement);
            console.log('iOS: MediaElementSource created for video');
        }
        if (!videoGainNode) {
            videoGainNode = audioContext.createGain();
            videoGainNode.gain.value = isMuted ? 0 : Math.max(volumeLevel / 100, 0.01);
            audioSource.connect(videoGainNode).connect(audioContext.destination);
            console.log('iOS: Video audio graph initialized with gain:', videoGainNode.gain.value);
        } else {
            videoGainNode.gain.value = isMuted ? 0 : Math.max(volumeLevel / 100, 0.01);
        }
    } catch (e) {
        console.log('setupVideoAudioGraph error:', e);
    }
}

// Helper to detect mobile viewport (match CSS breakpoint)
function isMobileViewport() {
    return window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
}

// Update rolodex text display with scroll animation reset
function updateRolodexText(channelIndex) {
    const rolodexText = document.getElementById('rolodexText');
    const file = shuffledVideoFiles[channelIndex];
    
    // Remove animation temporarily
    rolodexText.style.animation = 'none';
    
    // Update text
    rolodexText.textContent = file.description || 'Lorem ipsum dolor sit amet';
    
    // Trigger reflow to restart animation if needed
    void rolodexText.offsetWidth;

    // Use vertical bottom-to-top marquee on desktop; mobile rolodex is hidden
    if (!isMobileViewport()) {
        rolodexText.style.animation = 'scrollText 12s linear infinite, textGlow 2s ease-in-out infinite';
    } else {
        rolodexText.style.animation = 'none';
    }
}

// Track mouse movement for background effect
document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    updateBackgroundShading();
});

function updateBackgroundShading() {
    const xPercent = (mouseX / window.innerWidth) * 100;
    const yPercent = (mouseY / window.innerHeight) * 100;
    
    const beforeElement = document.querySelector('body::before');
    document.body.style.setProperty('--mouse-x', `${xPercent}%`);
    document.body.style.setProperty('--mouse-y', `${yPercent}%`);
    
    // Update the pseudo-element's background via a style tag
    const styleId = 'dynamic-bg-style';
    let styleTag = document.getElementById(styleId);
    
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }
    
    styleTag.textContent = `
        body::before {
            background: radial-gradient(circle 1200px at ${xPercent}% ${yPercent}%, rgba(60,55,45,0.3) 0%, rgba(0,0,0,0.8) 100%) !important;
        }
    `;
}

// Initialize background position
updateBackgroundShading();

// Create static noise audio
function createStaticNoise() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioContext.sampleRate * 0.5; // 0.5 seconds
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        
        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        return buffer;
    } catch (e) {
        console.log('Web Audio API not supported:', e);
        return null;
    }
}

// Play static sound
function playStaticSound() {
    if (!audioContext) return;
    
    try {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = staticAudio;
        gainNode.gain.value = isMuted ? 0 : (volumeLevel / 100) * 0.3; // 30% of current volume
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.start(0);
    } catch (e) {
        console.log('Error playing static:', e);
    }
}

// Animated TV static on canvas
let staticAnimationId = null;

function drawStaticNoise() {
    const canvas = document.getElementById('staticNoise');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match container
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    function animate() {
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const buffer = new Uint32Array(imageData.data.buffer);
        
        // Generate random static noise
        for (let i = 0; i < buffer.length; i++) {
            // Random grayscale value
            const gray = Math.random() > 0.5 ? 255 : 0;
            // ABGR format (alpha, blue, green, red)
            buffer[i] = (255 << 24) | (gray << 16) | (gray << 8) | gray;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Continue animation if static is active
        if (document.getElementById('staticNoise').classList.contains('active')) {
            staticAnimationId = requestAnimationFrame(animate);
        }
    }
    
    animate();
}

function stopStaticNoise() {
    if (staticAnimationId) {
        cancelAnimationFrame(staticAnimationId);
        staticAnimationId = null;
    }
}

// Screen Wake Lock functions - Cross-browser compatible with iOS Safari 16.4+
// CRITICAL for iOS: Audio MUST be unmuted and playing for screen to stay awake
async function requestWakeLock() {
    // Only request wake lock if audio is playing (unmuted)
    if (isMuted) {
        console.log('Cannot request wake lock while muted - audio must be playing for iOS');
        return;
    }
    
    // iOS CRITICAL: Ensure video element has audio playing and is unmuted
    if (isIOS && videoElement) {
        videoElement.muted = false;
        videoElement.volume = Math.max(volumeLevel / 100, 0.01); // Minimum 1% volume
        
        // Force play if paused
        if (videoElement.paused) {
            try {
                await videoElement.play();
                console.log('iOS: Video playback resumed with audio');
            } catch (err) {
                console.log('iOS: Could not start video playback:', err);
            }
        }
    }
    
    try {
        // Check if Wake Lock API is supported (Safari 16.4+, Chrome, Firefox)
        if ('wakeLock' in navigator) {
            wakeLockSupported = true;
            
            // Release any existing wake lock first to avoid conflicts
            if (wakeLock !== null && !wakeLock.released) {
                await releaseWakeLock();
            }
            
            // Request a new screen wake lock
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✓ Screen Wake Lock activated successfully');
            
            // Listen for wake lock release events
            wakeLock.addEventListener('release', () => {
                console.log('⚠ Screen Wake Lock was released');
                wakeLock = null;
                
                // iOS: Immediately try to re-acquire if still unmuted
                if (!isMuted && isIOS) {
                    console.log('iOS: Attempting to re-acquire wake lock...');
                    setTimeout(() => requestWakeLock(), 100);
                }
            });
        } else {
            console.log('Wake Lock API not supported - using audio playback fallback');
            wakeLockSupported = false;
            
            // iOS FALLBACK: Continuous audio playback is REQUIRED
            if (isIOS) {
                console.log('⚠ iOS detected: Audio playback MUST remain active to prevent sleep');
            }
        }
    } catch (err) {
        // Handle errors gracefully (low battery, permission denied, etc.)
        console.log(`✗ Wake Lock error: ${err.name}, ${err.message}`);
        
        // NotAllowedError: Permission denied or not allowed by system
        // NotSupportedError: Wake Lock not supported
        if (err.name === 'NotAllowedError') {
            console.log('Wake Lock denied by system (possibly low battery or user settings)');
        }
        
        // iOS CRITICAL: Fallback relies on continuous audio playback
        if (isIOS) {
            console.log('⚠ iOS: Relying on audio playback to keep screen awake - DO NOT MUTE');
        }
        
        wakeLockSupported = false;
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            // Only release if not already released
            if (!wakeLock.released) {
                await wakeLock.release();
                console.log('Screen Wake Lock manually released');
            }
            wakeLock = null;
        } catch (err) {
            console.log(`Wake Lock release error: ${err.name}, ${err.message}`);
            wakeLock = null;
        }
    }
}

// Re-acquire wake lock when page becomes visible again
// This is crucial for iOS Safari when returning from background
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && !isMuted) {
        // Re-request wake lock when page becomes visible
        await requestWakeLock();
        
        // Ensure video continues playing (important for iOS fallback)
        if (videoElement && videoElement.paused) {
            try {
                await videoElement.play();
                console.log('Video resumed after visibility change');
            } catch (err) {
                console.log('Could not resume video:', err);
            }
        }
        
        // Ensure NoSleep video is playing if enabled
        if (noSleepEnabled && noSleepVideo && noSleepVideo.paused) {
            try {
                await noSleepVideo.play();
                console.log('NoSleep video resumed after visibility change');
            } catch (err) {
                console.log('Could not resume NoSleep video:', err);
            }
        }
    }
});

// NoSleep.js style implementation for older iOS versions (pre-16.4)
// Creates a hidden video that plays continuously to prevent screen sleep
// This serves as a fallback when Wake Lock API is not supported
function createNoSleepVideo() {
    if (noSleepVideo) return; // Already created
    
    noSleepVideo = document.createElement('video');
    noSleepVideo.setAttribute('title', 'No Sleep');
    noSleepVideo.setAttribute('playsinline', ''); // Critical for iOS
    noSleepVideo.setAttribute('loop', '');
    noSleepVideo.setAttribute('muted', ''); // Muted so it doesn't interfere with main audio
    
    // Set styles to hide it completely but keep it functional
    noSleepVideo.style.position = 'fixed';
    noSleepVideo.style.top = '-1px';
    noSleepVideo.style.left = '-1px';
    noSleepVideo.style.width = '1px';
    noSleepVideo.style.height = '1px';
    noSleepVideo.style.opacity = '0.01';
    noSleepVideo.style.pointerEvents = 'none';
    noSleepVideo.style.zIndex = '-1000';
    
    // Create a minimal WebM video (1 frame, transparent)
    // This is a base64-encoded 1-second transparent WebM video
    const webmSource = document.createElement('source');
    webmSource.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBEAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjNTguMTguMTAwV0GHh0VOQ09ERVJEh49MYXZjNTguMTguMTAwc6SQ20Yv/Elws73A/+KfEjM11ESJiEBEAAAAAAAAFlSua8yuAQAAAAAAAD/rgQAfQ7Z1AQAAAAAAALHngQCgAQAAAAAAAFyho4+BAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjNTguMTguMTAwV0GHh0VOQ09ERVJEh49MYXZjNTguMTguMTAwc6SQ20Yv/Elws73A/+KfEjM11ESJiEBEAAAAAAAAFlSua8yuAQAAAAAAAD/rgQAfQ7Z1AQAAAAAAALHngQCgAQAAAAAAAFyho4+BAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjNTguMTguMTAwV0GHh0VOQ09ERVJEh49MYXZjNTguMTguMTAwc6SQ20Yv/Elws73A/+KfEjM11ESJiEBEAAAAAAAAFlSua8yuAQAAAAAAAD/rgQAfQ7Z1AQAAAAAAALHngQCgAQAAAAAAAFyho4+BAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjNTguMTguMTAwV0GHh0VOQ09ERVJEh49MYXZjNTguMTguMTAwc6SQ20Yv/Elws73A/+KfEjM11A==';
    webmSource.type = 'video/webm';
    
    noSleepVideo.appendChild(webmSource);
    
    // Add MP4 fallback for older iOS versions
    const mp4Source = document.createElement('source');
    mp4Source.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACKBtZGF0AAAC rgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0MiByMjQ3OSBkZDc5YTYxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAz//728P4FNjuY0JcRzeidMx+/Fbi6NDe9zgAAAwADAAA7EAL6AAADABTj5k1Exq7wAAAPeYEYLkA=';
    mp4Source.type = 'video/mp4';
    
    noSleepVideo.appendChild(mp4Source);
    
    document.body.appendChild(noSleepVideo);
    
    console.log('NoSleep video element created for fallback');
}

// Enable NoSleep video playback (for older browsers without Wake Lock API)
async function enableNoSleep() {
    if (noSleepEnabled) return;
    
    // iOS: ALWAYS use NoSleep as additional insurance, even with Wake Lock
    // Other browsers: Only if Wake Lock not supported
    if (wakeLockSupported && !isIOS) {
        console.log('Wake Lock API available (non-iOS), skipping NoSleep video');
        return;
    }
    
    createNoSleepVideo();
    
    try {
        await noSleepVideo.play();
        noSleepEnabled = true;
        
        if (isIOS) {
            console.log('✓ iOS: NoSleep video playing as additional wake lock insurance');
        } else {
            console.log('NoSleep video playing - screen should stay awake (fallback method)');
        }
    } catch (err) {
        console.log('NoSleep video play error:', err);
        noSleepEnabled = false;
        
        if (isIOS) {
            console.log('⚠ iOS: NoSleep failed, relying solely on main video with audio');
        } else {
            console.log('Relying on main video playback to keep screen awake');
        }
    }
}

// Disable NoSleep video playback
function disableNoSleep() {
    if (!noSleepEnabled || !noSleepVideo) return;
    
    try {
        noSleepVideo.pause();
        noSleepEnabled = false;
        console.log('NoSleep video paused');
    } catch (err) {
        console.log('NoSleep video pause error:', err);
    }
}

// Keep-alive mechanism - ensures continuous playback to prevent screen sleep
// This works across all browsers and iOS versions as a universal fallback
// CRITICAL FOR iOS: Audio must be playing continuously
function startKeepAlive() {
    stopKeepAlive(); // Clear any existing interval
    
    // Enable the NoSleep hidden video fallback (only if Wake Lock not supported)
    enableNoSleep();
    
    // iOS requires MORE aggressive monitoring (every 1 second instead of 3)
    const checkInterval = isIOS ? 1000 : 3000;
    
    // Monitor video playback to ensure continuous playback
    // This is CRITICAL for iOS where videos/audio can pause unexpectedly
    keepAliveInterval = setInterval(() => {
        if (!isMuted) {
            // iOS CRITICAL: Check video element state more thoroughly
            if (videoElement) {
                // Check if video is actually playing (ignore 'ended' state as loop handles it)
                const isPlaying = !videoElement.paused && videoElement.currentTime > 0;
                
                // Only intervene if video is truly paused (not just at 'ended' state for looping)
                if (!isPlaying && !videoElement.ended) {
                    console.log('⚠ Main video paused unexpectedly, restarting...');
                    videoElement.muted = false; // iOS: Ensure unmuted
                    videoElement.volume = Math.max(volumeLevel / 100, 0.01); // Minimum volume
                    videoElement.play().catch(err => {
                        console.log('✗ Could not restart main video:', err);
                    });
                }
                
                // If video is ended and paused (loop might have failed), restart it
                if (videoElement.ended && videoElement.paused) {
                    console.log('⚠ Video ended and paused (loop failed), restarting...');
                    videoElement.currentTime = 0;
                    videoElement.play().catch(err => {
                        console.log('✗ Could not restart ended video:', err);
                    });
                }
                
                // iOS: Ensure video is never muted
                if (isIOS && videoElement.muted) {
                    console.log('⚠ iOS: Video was muted, unmuting...');
                    videoElement.muted = false;
                    videoElement.volume = Math.max(volumeLevel / 100, 0.01);
                }
            }
            
            // Check and restart NoSleep video if enabled and paused
            if (noSleepEnabled && noSleepVideo && noSleepVideo.paused) {
                console.log('NoSleep video paused, restarting...');
                noSleepVideo.play().catch(err => {
                    console.log('Could not restart NoSleep video:', err);
                });
            }
            
            // Re-request wake lock if it was released (e.g., by system)
            if (wakeLockSupported && (wakeLock === null || (wakeLock && wakeLock.released))) {
                console.log('⚠ Wake lock was released, re-requesting...');
                requestWakeLock().catch(err => {
                    console.log('Could not re-request wake lock:', err);
                });
            }
            
            // iOS: Log status for debugging (only log issues, not normal state)
            if (isIOS && videoElement) {
                const hasIssue = videoElement.paused || videoElement.muted || 
                                (wakeLockSupported && (wakeLock === null || wakeLock.released));
                
                if (hasIssue) {
                    const status = {
                        playing: !videoElement.paused,
                        muted: videoElement.muted,
                        volume: videoElement.volume,
                        wakeLock: wakeLock !== null && !wakeLock?.released
                    };
                    console.log('⚠ iOS Keep-Alive Issue:', status);
                }
            }
        }
    }, checkInterval);
    
    console.log(`Keep-alive mechanism started (checking every ${checkInterval}ms)`);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        console.log('Keep-alive mechanism stopped');
    }
    
    // Disable the NoSleep hidden video
    disableNoSleep();
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // iOS Safari viewport fix: set --vh to actual innerHeight
    function setVhUnit() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setVhUnit();
    window.addEventListener('resize', setVhUnit);
    window.addEventListener('orientationchange', () => setTimeout(setVhUnit, 100));

    // Add iOS Safari class for potential CSS tweaks
    if (isIOS && isSafari) {
        document.documentElement.classList.add('ios-safari');
    }

    // Create static noise audio buffer
    staticAudio = createStaticNoise();
    
    // Initialize TV components
    initializeTV();
    setupEventListeners();
    
    // Ensure video keeps playing if page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && videoElement && videoElement.paused) {
            videoElement.play();
        }
    });
    
    // Restart video playback if page comes back into focus
    window.addEventListener('focus', () => {
        if (videoElement && videoElement.paused) {
            videoElement.play();
        }
    });
    
    // Add glow to volume knob when muted
    setKnobGlow();
});

function initializeTV() {
    // Start with first video muted
    loadChannel(currentChannel);
}

function loadChannel(channelIndex) {
    const videoFrame = document.getElementById('videoFrame');
    const staticNoise = document.getElementById('staticNoise');
    const channelDisplay = document.getElementById('channelDisplay');

    // We are now loading a (possibly new) channel
    channelChanging = true;
    
    // Clear previous content
    videoFrame.innerHTML = '';
    
    // Reset audio graph for new video element (iOS only)
    if (isIOS) {
        audioSource = null;
        videoGainNode = null;
    }
    
    // Create native HTML5 video element
    videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.loop = true;
    videoElement.playsInline = true; // CRITICAL for iOS inline playback
    videoElement.muted = isMuted;
    videoElement.volume = volumeLevel / 100;
    videoElement.preload = 'auto'; // Ensure video is fully loaded
    
    // iOS CRITICAL: Set additional attributes to prevent auto-pause
    if (isIOS) {
        videoElement.setAttribute('webkit-playsinline', ''); // Legacy iOS support
        videoElement.setAttribute('x-webkit-airplay', 'allow');
    }

    // Append single WebM source (playlist is WebM-only)
    const file = shuffledVideoFiles[channelIndex];
    const webmSource = document.createElement('source');
    webmSource.src = file.webm;
    webmSource.type = 'video/webm';
    videoElement.appendChild(webmSource);

    // Prevent user from pausing the video - important for iOS
    // Note: Don't interfere with natural 'ended' state for looping
    videoElement.addEventListener('pause', () => {
        // Allow pause if video has ended (it will loop automatically)
        if (videoElement.ended) {
            return;
        }
        
        // Otherwise, if unmuted, resume playback
        if (!isMuted) {
            console.log('Video paused unexpectedly, resuming...');
            videoElement.play().catch(err => {
                console.log('Could not resume paused video:', err);
            });
        }
    });

    // Robust looping: if the loop attribute fails on some browsers/codecs, manually restart
    // Only do this if we are NOT in the process of switching channels
    videoElement.addEventListener('ended', () => {
        if (channelChanging) return; // A new channel is coming in; don't restart this one
        // Immediate restart (avoids brief pause). currentTime reset ensures proper seek to start.
        videoElement.currentTime = 0;
        const p = videoElement.play();
        if (p) {
            p.catch(err => console.log('Manual loop restart failed:', err));
        }
    });
    
    // iOS-specific: Handle when video starts playing
    videoElement.addEventListener('play', () => {
        console.log('Video playback started');
        // If unmuted, make sure wake lock is active
        if (!isMuted) {
            requestWakeLock().catch(err => {
                console.log('Could not request wake lock on play:', err);
            });
        }
    });
    
    // iOS-specific: Detect when video can play through without buffering
    videoElement.addEventListener('canplaythrough', () => {
        console.log('Video can play through');
    }, { once: true });
    
    // iOS CRITICAL: Prevent video from being muted by iOS
    if (isIOS) {
        videoElement.addEventListener('volumechange', () => {
            // If iOS tries to mute the video, unmute it immediately
            if (!isMuted && videoElement.muted) {
                console.log('⚠ iOS tried to mute video, preventing...');
                videoElement.muted = false;
                videoElement.volume = Math.max(volumeLevel / 100, 0.01);
            }
        });
        
        // iOS: Monitor for any suspend/stall events
        videoElement.addEventListener('suspend', () => {
            console.log('⚠ iOS: Video suspended, attempting resume...');
            if (!isMuted) {
                videoElement.play().catch(err => console.log('Resume failed:', err));
            }
        });
        
        videoElement.addEventListener('stalled', () => {
            console.log('⚠ iOS: Video stalled, attempting resume...');
            if (!isMuted) {
                videoElement.play().catch(err => console.log('Resume failed:', err));
            }
        });
    }

    // Style the video element
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';

    // Add to DOM
    videoFrame.appendChild(videoElement);

    // Defer Web Audio pipeline until audio is unlocked and unmuted to ensure autoplay works while muted on iOS
    // The graph will be created in ensureAudioUnlocked()/setupVideoAudioGraph()

    // If unmuted, set up audio graph (iOS only) and ensure video is unmuted
    if (!isMuted) {
        if (isIOS && audioContext) {
            setupVideoAudioGraph();
        }
        videoElement.muted = false;
    }

    // Update channel display
    channelDisplay.textContent = `CH ${channelIndex + 1}`;
    
    // Update rolodex text display
    updateRolodexText(channelIndex);
    
    // Handle video loading errors - skip to next channel
    videoElement.addEventListener('error', (e) => {
        console.log(`Video error on channel ${channelIndex + 1}, skipping to next...`, e);
        // Move to next channel automatically
        setTimeout(() => {
            currentChannel = channelIndex + 1;
            if (currentChannel >= shuffledVideoFiles.length) {
                currentChannel = 0;
            }
            loadChannel(currentChannel);
        }, 500);
    }, { once: true });
    
    // Also handle source errors
    // Handle source error
    webmSource.addEventListener('error', (e) => {
        console.log(`WebM source error on channel ${channelIndex + 1}`, e);
        videoElement.dispatchEvent(new Event('error'));
    }, { once: true });
    
    // Hide static only after video is ready to play
    videoElement.addEventListener('canplay', () => {
        staticNoise.classList.remove('active');
        stopStaticNoise();
        // Channel finished loading; future ended events should loop
        channelChanging = false;
    }, { once: true });
    
    // Force play video immediately
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Autoplay started successfully
            if (!isMuted) {
                videoElement.muted = false;
                if (videoGainNode) videoGainNode.gain.value = Math.max(volumeLevel / 100, 0.01);
            }
        }).catch(err => {
            // Autoplay was prevented
            console.log('Autoplay prevented:', err);
        });
    }
}

function changeChannel(direction) {
    const staticNoise = document.getElementById('staticNoise');
    
    // Show static immediately and play sound
    staticNoise.classList.add('active');
    drawStaticNoise();
    playStaticSound();

    // Indicate we're mid channel switch so the old video's 'ended' won't force-loop
    channelChanging = true;

    // Wait 0.5 seconds of static before changing channel
    setTimeout(() => {
        currentChannel += direction;
        if (currentChannel >= shuffledVideoFiles.length) {
            currentChannel = 0;
        } else if (currentChannel < 0) {
            currentChannel = shuffledVideoFiles.length - 1;
        }
        loadChannel(currentChannel);
        // (Static will be hidden by video canplay event)
    }, 500);
}

async function toggleMute() {
    isMuted = !isMuted;
    
    if (videoElement) {
        // If we're unmuting, we need to ensure audio is unlocked first
        if (!isMuted) {
            await ensureAudioUnlocked();
        }
        
        // On iOS: use Web Audio API gain node if it exists
        // On Desktop: use native video element controls
        if (isIOS && videoGainNode) {
            // iOS: Web Audio API controls the audio
            videoGainNode.gain.value = isMuted ? 0 : Math.max(volumeLevel / 100, 0.01);
            videoElement.muted = isMuted;
        } else {
            // Desktop or no Web Audio API: use native mute
            videoElement.muted = isMuted;
        }
        
        // Ensure video volume is set
        videoElement.volume = Math.max(volumeLevel / 100, 0.01);
    }
    
    setKnobGlow();
    showVolumeIndicator();
    
    // Manage wake lock and keep-alive based on mute state
    if (!isMuted) {
        requestWakeLock();
        startKeepAlive();
    } else {
        releaseWakeLock();
        stopKeepAlive();
    }
}

function adjustVolume(delta) {
    volumeLevel = Math.max(0, Math.min(100, volumeLevel + delta));
    if (videoElement) {
        videoElement.volume = volumeLevel / 100;
        if (isIOS && videoGainNode) {
            // iOS: Use GainNode as canonical volume controller
            videoGainNode.gain.value = isMuted ? 0 : Math.max(volumeLevel / 100, 0.01);
        }
        if (isMuted && volumeLevel > 0) {
            isMuted = false;
            videoElement.muted = false;
            // Unlock audio pipeline & wake lock when unmuting via volume adjustment
            ensureAudioUnlocked();
            requestWakeLock();
            startKeepAlive();
            if (isIOS && videoGainNode) videoGainNode.gain.value = Math.max(volumeLevel / 100, 0.01);
        }
    }
    showVolumeIndicator();
}

function showVolumeIndicator() {
    const volumeIndicator = document.getElementById('volumeIndicator');
    volumeIndicator.textContent = isMuted ? 'MUTE' : `VOL: ${volumeLevel}`;
    volumeIndicator.classList.remove('show');
    
    // Force reflow
    void volumeIndicator.offsetWidth;
    
    volumeIndicator.classList.add('show');
    
    if (volumeTimeout) {
        clearTimeout(volumeTimeout);
    }
    
    volumeTimeout = setTimeout(() => {
        volumeIndicator.classList.remove('show');
    }, 2000);
}

// Add glow to volume knob when muted
function setKnobGlow() {
    const knob = document.getElementById('volumeKnob');
    if (!knob) return;
    if (isMuted) {
        knob.classList.add('glow');
    } else {
        knob.classList.remove('glow');
    }
}

// Cockroach easter egg
function spawnCockroach() {
    const phrases = [
        { german: "Die Verwandlung ist real!", english: "The metamorphosis is real!" },
        { german: "Ich bin ein Kafka-Käfer!", english: "I am a Kafka beetle!" },
        { german: "Guten Tag, Gregor hier!", english: "Good day, Gregor here!" },
        { german: "Das Ungeziefer meldet sich!", english: "The vermin reports for duty!" },
        { german: "Franz hätte das geliebt!", english: "Franz would have loved this!" },
        { german: "Ich bin kein Ungeziefer... oder doch?", english: "I'm not vermin... or am I?" },
        { german: "Der Prozess beginnt jetzt!", english: "The trial begins now!" },
        { german: "Kafkaesk? Nein, nur ein Käfer!", english: "Kafkaesque? No, just a beetle!" },
        { german: "Metamorphose abgeschlossen!", english: "Metamorphosis complete!" },
        { german: "Existentielle Krise als Insekt!", english: "Existential crisis as an insect!" },
        { german: "Vor dem Gesetz steht ein Käfer!", english: "Before the law stands a beetle!" },
        { german: "Das Schloss ist unerreichbar!", english: "The castle is unreachable!" },
        { german: "Ich wurde zum Käfer verhaftet!", english: "I was arrested as a beetle!" },
        { german: "Bürokratie auf sechs Beinen!", english: "Bureaucracy on six legs!" },
        { german: "Der Beamte ist auch ein Käfer!", english: "The bureaucrat is also a beetle!" },
        { german: "Entfremdung? Ich bin ein Insekt!", english: "Alienation? I'm an insect!" },
        { german: "Das Urteil: Schuldig als Käfer!", english: "The verdict: Guilty as a beetle!" },
        { german: "Amerika? Nein, ich bleibe hier!", english: "America? No, I'm staying here!" },
        { german: "Hungerkünstler? Lieber Käfer!", english: "Hunger artist? Rather a beetle!" },
        { german: "Meine Familie versteht mich nicht!", english: "My family doesn't understand me!" },
        { german: "Zu spät für den Zug... wieder!", english: "Too late for the train... again!" },
        { german: "Schuld ohne Grund!", english: "Guilt without reason!" },
        { german: "Das absurde Leben eines Käfers!", english: "The absurd life of a beetle!" },
        { german: "Ich krabbel, also bin ich!", english: "I crawl, therefore I am!" }
    ];
    
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    
    const cockroach = document.createElement('div');
    cockroach.className = 'cockroach-easter-egg';
    cockroach.innerHTML = `
        <div class="cockroach-emoji">🪳</div>
        <div class="cockroach-speech">
            ${randomPhrase.german}
            <div class="cockroach-translation">${randomPhrase.english}</div>
        </div>
    `;
    
    document.body.appendChild(cockroach);
    
    // Animate in
    setTimeout(() => {
        cockroach.classList.add('active');
    }, 10);
    
    // Scurry off after 3 seconds
    setTimeout(() => {
        cockroach.classList.add('scurrying');
    }, 3000);
    
    // Remove from DOM after animation
    setTimeout(() => {
        cockroach.remove();
    }, 4500);
}

// --- Speaker Animation ---
let speakerAnimationId = null;
let speakerTime = 0;

function startSpeakerAnimation() {
    stopSpeakerAnimation();
    const left = document.querySelector('.speaker-left');
    const right = document.querySelector('.speaker-right');
    if (!left || !right) return;
    
    // Get all speaker components
    const leftWoofer = left.querySelector('.speaker-woofer');
    const leftTweeterTop = left.querySelector('.speaker-tweeter');
    const leftTweeterBottom = left.querySelector('.speaker-tweeter-bottom');
    const rightWoofer = right.querySelector('.speaker-woofer');
    const rightTweeterTop = right.querySelector('.speaker-tweeter');
    const rightTweeterBottom = right.querySelector('.speaker-tweeter-bottom');
    
    speakerTime = 0;
    
    function animate() {
        // Only animate if NOT muted
        if (!isMuted) {
            speakerTime += 0.1;
            
            // Create smooth, wave-based animations with different frequencies
            // Bass frequencies (woofer) - slower, more pronounced movement
            const bassWave = Math.sin(speakerTime * 0.7) * 0.5 + 0.5; // 0 to 1
            const bassScale = 1 + (bassWave * 0.20); // Scale between 1 and 1.20 (much more visible)
            
            // Mid frequencies (tweeters) - faster, more noticeable movement
            const midWave = Math.sin(speakerTime * 1.6) * 0.5 + 0.5;
            const midScale = 1 + (midWave * 0.12); // Scale between 1 and 1.12 (much more visible)
            
            // Add slight randomness for natural feel
            const randomVariation = (Math.random() - 0.5) * 0.04;
            
            // Apply animations to left speaker
            if (leftWoofer) leftWoofer.style.transform = `scale(${bassScale + randomVariation})`;
            if (leftTweeterTop) leftTweeterTop.style.transform = `scale(${midScale + randomVariation * 0.5})`;
            if (leftTweeterBottom) leftTweeterBottom.style.transform = `scale(${midScale + randomVariation * 0.5})`;
            
            // Apply animations to right speaker (slightly offset phase for stereo effect)
            const rightBassWave = Math.sin((speakerTime + 0.5) * 0.7) * 0.5 + 0.5;
            const rightBassScale = 1 + (rightBassWave * 0.20);
            const rightMidWave = Math.sin((speakerTime + 0.5) * 1.6) * 0.5 + 0.5;
            const rightMidScale = 1 + (rightMidWave * 0.12);
            
            if (rightWoofer) rightWoofer.style.transform = `scale(${rightBassScale + randomVariation})`;
            if (rightTweeterTop) rightTweeterTop.style.transform = `scale(${rightMidScale + randomVariation * 0.5})`;
            if (rightTweeterBottom) rightTweeterBottom.style.transform = `scale(${rightMidScale + randomVariation * 0.5})`;
        } else {
            // Reset all transformations when muted
            if (leftWoofer) leftWoofer.style.transform = '';
            if (leftTweeterTop) leftTweeterTop.style.transform = '';
            if (leftTweeterBottom) leftTweeterBottom.style.transform = '';
            if (rightWoofer) rightWoofer.style.transform = '';
            if (rightTweeterTop) rightTweeterTop.style.transform = '';
            if (rightTweeterBottom) rightTweeterBottom.style.transform = '';
        }
        speakerAnimationId = requestAnimationFrame(animate);
    }
    animate();
}

function stopSpeakerAnimation() {
    if (speakerAnimationId) {
        cancelAnimationFrame(speakerAnimationId);
        speakerAnimationId = null;
    }
    const left = document.querySelector('.speaker-left');
    const right = document.querySelector('.speaker-right');
    
    // Reset all speaker components
    if (left) {
        const leftWoofer = left.querySelector('.speaker-woofer');
        const leftTweeterTop = left.querySelector('.speaker-tweeter');
        const leftTweeterBottom = left.querySelector('.speaker-tweeter-bottom');
        if (leftWoofer) leftWoofer.style.transform = '';
        if (leftTweeterTop) leftTweeterTop.style.transform = '';
        if (leftTweeterBottom) leftTweeterBottom.style.transform = '';
    }
    
    if (right) {
        const rightWoofer = right.querySelector('.speaker-woofer');
        const rightTweeterTop = right.querySelector('.speaker-tweeter');
        const rightTweeterBottom = right.querySelector('.speaker-tweeter-bottom');
        if (rightWoofer) rightWoofer.style.transform = '';
        if (rightTweeterTop) rightTweeterTop.style.transform = '';
        if (rightTweeterBottom) rightTweeterBottom.style.transform = '';
    }
    
    speakerTime = 0;
}
function setupSpeakerAnimationEvents() {
    if (!videoElement) return;
    
    // Remove old listeners first to prevent duplicates
    videoElement.removeEventListener('play', handleVideoPlay);
    videoElement.removeEventListener('pause', handleVideoPause);
    videoElement.removeEventListener('ended', handleVideoPause);
    
    // Add new listeners
    videoElement.addEventListener('play', handleVideoPlay);
    videoElement.addEventListener('pause', handleVideoPause);
    videoElement.addEventListener('ended', handleVideoPause);
}

// Event handlers for speaker animation
function handleVideoPlay() {
    if (!isMuted) {
        startSpeakerAnimation();
    }
}

function handleVideoPause() {
    if (isMuted) {
        stopSpeakerAnimation();
    }
}

// Patch into loadChannel and toggleMute
const origLoadChannel = loadChannel;
loadChannel = function(channelIndex) {
    origLoadChannel(channelIndex);
    setupSpeakerAnimationEvents();
    setKnobGlow();
    // Start animation if sound is enabled, regardless of play state
    if (!isMuted) {
        startSpeakerAnimation();
    } else {
        stopSpeakerAnimation();
    }
};
const origToggleMute = toggleMute;
toggleMute = function() {
    origToggleMute();
    setKnobGlow();
    // Start or stop animation and keep-alive based on mute state
    if (!isMuted) {
        startSpeakerAnimation();
        startKeepAlive();
    } else {
        stopSpeakerAnimation();
        stopKeepAlive();
    }
};

// One-time initialization on first user interaction (required for iOS)
let hasUserInteracted = false;

function initializeOnFirstInteraction() {
    if (hasUserInteracted) return;
    hasUserInteracted = true;
    
    console.log('First user interaction detected - initializing wake lock support');
    
    // Check wake lock support
    wakeLockSupported = 'wakeLock' in navigator;
    
    if (wakeLockSupported) {
        console.log('Wake Lock API is supported');
    } else {
        console.log('Wake Lock API not supported - will use video playback fallback');
    }
    
    // Remove the one-time event listeners
    document.removeEventListener('click', initializeOnFirstInteraction);
    document.removeEventListener('touchstart', initializeOnFirstInteraction);
    document.removeEventListener('keydown', initializeOnFirstInteraction);
}

// Add one-time event listeners for first interaction (important for iOS)
document.addEventListener('click', initializeOnFirstInteraction, { once: true });
document.addEventListener('touchstart', initializeOnFirstInteraction, { once: true });
document.addEventListener('keydown', initializeOnFirstInteraction, { once: true });

// Event listeners
function setupEventListeners() {
    document.getElementById('channelUp').addEventListener('click', () => changeChannel(1));
    document.getElementById('channelDown').addEventListener('click', () => changeChannel(-1));
    document.getElementById('volumeKnob').addEventListener('click', toggleMute);

    // Info button modal
    const infoButton = document.getElementById('infoButton');
    const infoModal = document.getElementById('infoModal');
    const closeModal = document.getElementById('closeModal');

    infoButton.addEventListener('click', () => {
        infoModal.classList.add('active');
    });

    closeModal.addEventListener('click', () => {
        infoModal.classList.remove('active');
        
        // Increment counter when closing modal
        infoButtonClicks++;
        
        // Spawn cockroach on 3rd close
        if (infoButtonClicks === 3) {
            spawnCockroach();
            infoButtonClicks = 0; // Reset counter
        }
    });

    // Close modal when clicking outside
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.remove('active');
            
            // Increment counter when closing via outside click
            infoButtonClicks++;
            
            // Spawn cockroach on 3rd close
            if (infoButtonClicks === 3) {
                spawnCockroach();
                infoButtonClicks = 0; // Reset counter
            }
        }
    });

    // Volume knob rotation effect
    let knobRotation = 0;
    const volumeKnob = document.getElementById('volumeKnob');
    
    // Scroll wheel support
    volumeKnob.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;
        adjustVolume(delta);
        knobRotation += delta * 3;
        e.target.style.transform = `rotate(${knobRotation}deg)`;
    });
    
    // Click and drag support
    let isDragging = false;
    let startY = 0;
    let startVolume = 0;
    
    volumeKnob.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        isDragging = true;
        startY = e.clientY;
        startVolume = volumeLevel;
        volumeKnob.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaY = startY - e.clientY; // Inverted: drag up = increase volume
        const volumeChange = Math.round(deltaY / 2); // 2px = 1 volume unit
        const newVolume = Math.max(0, Math.min(100, startVolume + volumeChange));
        
        if (newVolume !== volumeLevel) {
            volumeLevel = newVolume;
            if (videoElement) {
                videoElement.volume = volumeLevel / 100;
                if (isMuted && volumeLevel > 0) {
                    isMuted = false;
                    videoElement.muted = false;
                    ensureAudioUnlocked();
                    requestWakeLock();
                    startKeepAlive();
                    if (videoGainNode) videoGainNode.gain.value = Math.max(volumeLevel / 100, 0.01);
                }
            }
            showVolumeIndicator();
            
            // Rotate knob based on volume change
            knobRotation = volumeChange * 3;
            volumeKnob.style.transform = `rotate(${knobRotation}deg)`;
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            volumeKnob.style.cursor = 'grab';
        }
    });

    // Touch support for mobile devices
    let touchMoved = false;
    let touchStartTime = 0;
    let lastToggleTime = 0;
    
    volumeKnob.addEventListener('touchstart', (e) => {
        touchMoved = false;
        touchStartTime = Date.now();
        isDragging = true;
        startY = e.touches[0].clientY;
        startVolume = volumeLevel;
        // Don't prevent default yet - let it determine if it's a tap or drag
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const deltaY = Math.abs(startY - e.touches[0].clientY);
        
        // If moved more than 10px, it's a drag not a tap
        if (deltaY > 10) {
            touchMoved = true;
            
            const actualDeltaY = startY - e.touches[0].clientY; // Inverted: drag up = increase volume
            const volumeChange = Math.round(actualDeltaY / 2); // 2px = 1 volume unit
            const newVolume = Math.max(0, Math.min(100, startVolume + volumeChange));
            
            if (newVolume !== volumeLevel) {
                volumeLevel = newVolume;
                if (videoElement) {
                    videoElement.volume = volumeLevel / 100;
                    if (isMuted && volumeLevel > 0) {
                        isMuted = false;
                        videoElement.muted = false;
                        ensureAudioUnlocked();
                        requestWakeLock();
                        startKeepAlive();
                        if (videoGainNode) videoGainNode.gain.value = Math.max(volumeLevel / 100, 0.01);
                    }
                }
                showVolumeIndicator();
                
                // Rotate knob based on volume change
                knobRotation = volumeChange * 3;
                volumeKnob.style.transform = `rotate(${knobRotation}deg)`;
            }
        }
    }, { passive: true });
    
    volumeKnob.addEventListener('touchend', (e) => {
        if (isDragging) {
            const touchDuration = Date.now() - touchStartTime;
            const now = Date.now();
            
            // If it was a quick tap (less than 200ms and didn't move much)
            // AND we haven't toggled in the last 300ms (debounce)
            if (!touchMoved && touchDuration < 200 && (now - lastToggleTime) > 300) {
                // Prevent the click event from also firing
                e.preventDefault();
                // Trigger the toggle mute function
                toggleMute();
                // Hide the unmute tooltip
                hideUnmuteTooltip();
                lastToggleTime = now;
            }
            
            isDragging = false;
            touchMoved = false;
        }
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                changeChannel(1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                changeChannel(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                adjustVolume(5);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                adjustVolume(-5);
                break;
            case 'm':
            case 'M':
                toggleMute();
                break;
        }
    });
}

// Unmute tooltip functionality
function positionUnmuteTooltip() {
    const volumeKnob = document.getElementById('volumeKnob');
    const tooltip = document.getElementById('unmuteTooltip');
    
    if (!volumeKnob || !tooltip) return;
    
    const knobRect = volumeKnob.getBoundingClientRect();
    const knobCenterY = knobRect.top + (knobRect.height / 2);
    const isMobile = window.innerWidth <= 700;
    
    // Remove any existing arrow direction classes
    tooltip.classList.remove('arrow-up', 'arrow-down', 'arrow-right');
    
    if (isMobile) {
        // On mobile, use dynamic positioning based on where tooltip ends up
        // Get tooltip's computed position to determine where it actually is
        tooltip.style.left = `${knobRect.left + (knobRect.width / 2)}px`;
        tooltip.style.top = `${knobRect.bottom + 15}px`;
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipCenterY = tooltipRect.top + (tooltipRect.height / 2);
        
        // Check if tooltip is positioned above or below the knob center
        if (tooltipCenterY < knobCenterY) {
            // Tooltip is above the knob, arrow should point down
            tooltip.classList.add('arrow-down');
            tooltip.style.left = `${knobRect.left + (knobRect.width / 2)}px`;
            tooltip.style.top = `${knobRect.top - tooltip.offsetHeight - 15}px`;
            tooltip.style.transform = 'translateX(-50%)';
        } else {
            // Tooltip is below the knob, arrow should point up
            tooltip.classList.add('arrow-up');
            tooltip.style.left = `${knobRect.left + (knobRect.width / 2)}px`;
            tooltip.style.top = `${knobRect.bottom + 15}px`;
            tooltip.style.transform = 'translateX(-50%)';
        }
    } else {
        // On desktop, default to right side with arrow pointing left
        tooltip.classList.add('arrow-right');
        tooltip.style.left = `${knobRect.right + 20}px`;
        tooltip.style.top = `${knobRect.top + (knobRect.height / 2) - (tooltip.offsetHeight / 2)}px`;
        tooltip.style.transform = 'translateX(0)';
    }
}

function showUnmuteTooltip() {
    const tooltip = document.getElementById('unmuteTooltip');
    if (!tooltip) return;
    
    // iOS: Update tooltip text to emphasize importance
    if (isIOS) {
        const tooltipText = tooltip.querySelector('.tooltip-text');
        if (tooltipText) {
            tooltipText.textContent = 'Click to unmute';
        }
    }
    
    // Position and show tooltip after a short delay
    setTimeout(() => {
        positionUnmuteTooltip();
        tooltip.classList.add('show');
    }, 500);
}

function hideUnmuteTooltip() {
    const tooltip = document.getElementById('unmuteTooltip');
    if (!tooltip) return;
    
    tooltip.classList.remove('show');
}

// Show tooltip on page load
window.addEventListener('load', () => {
    if (isMuted) {
        showUnmuteTooltip();
    }
});

// Hide tooltip when volume knob is clicked
document.addEventListener('DOMContentLoaded', () => {
    const volumeKnob = document.getElementById('volumeKnob');
    if (volumeKnob) {
        volumeKnob.addEventListener('click', hideUnmuteTooltip);
    }
});

// Reposition tooltip on window resize
window.addEventListener('resize', () => {
    const tooltip = document.getElementById('unmuteTooltip');
    if (tooltip && tooltip.classList.contains('show')) {
        positionUnmuteTooltip();
    }
});

