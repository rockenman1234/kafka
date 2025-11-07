// Local video files from /vids directory
// Each entry is an object with both mp4 and webm sources
const GITHUB_RAW_BASE = 'https://github.com/rockenman1234/kafka/raw/main/vids/';
const videoFiles = [
    {
        webm: GITHUB_RAW_BASE + 'rick-astley.webm'
    },
    {
        webm: GITHUB_RAW_BASE + 'la-cucaracha.webm'
    },
    {
        webm: GITHUB_RAW_BASE + 'messi-glaze.webm'
    },
    {
        webm: GITHUB_RAW_BASE + 'die-woodys.webm'
    },
    {
        webm: GITHUB_RAW_BASE + 'murica.webm'
    },
    {
        webm: GITHUB_RAW_BASE + 'kafka-edit.webm'
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
let volumeTimeout = null;
let backgroundInterval = null;
let staticAudio = null;
let audioContext = null;
let analyser = null;
let audioSource = null;
let animationFrameId = null;
let infoButtonClicks = 0; // Track info button clicks for easter egg
let wakeLock = null; // Screen Wake Lock
let keepAliveInterval = null; // Interval to keep video playing on iOS
let noSleepVideo = null; // Hidden video for iOS wake lock workaround
let noSleepEnabled = false;

// Mouse tracking for dynamic background shading
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

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

// Screen Wake Lock functions
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            // Release any existing wake lock first
            if (wakeLock !== null) {
                await releaseWakeLock();
            }
            
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock activated');
            
            // Handle wake lock release (e.g., when tab becomes inactive)
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
                wakeLock = null;
            });
        } else {
            console.log('Wake Lock API not supported - relying on video playback');
        }
    } catch (err) {
        console.log(`Wake Lock error: ${err.name}, ${err.message}`);
        // On iOS, video playback with audio should keep screen awake
        console.log('Falling back to video playback to keep screen awake');
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            await wakeLock.release();
            wakeLock = null;
            console.log('Screen Wake Lock manually released');
        } catch (err) {
            console.log(`Wake Lock release error: ${err.name}, ${err.message}`);
        }
    }
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && !isMuted) {
        await requestWakeLock();
        // Also ensure video is playing on iOS
        if (videoElement && videoElement.paused) {
            try {
                await videoElement.play();
            } catch (err) {
                console.log('Could not resume video:', err);
            }
        }
    }
});

// NoSleep.js style implementation for iOS
// Creates a hidden video that plays continuously to prevent screen sleep
function createNoSleepVideo() {
    if (noSleepVideo) return; // Already created
    
    noSleepVideo = document.createElement('video');
    noSleepVideo.setAttribute('title', 'No Sleep');
    noSleepVideo.setAttribute('playsinline', '');
    noSleepVideo.setAttribute('loop', '');
    noSleepVideo.setAttribute('muted', '');
    
    // Set styles to hide it completely
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
    
    console.log('NoSleep video element created');
}

// Enable NoSleep video playback
async function enableNoSleep() {
    if (noSleepEnabled) return;
    
    createNoSleepVideo();
    
    try {
        await noSleepVideo.play();
        noSleepEnabled = true;
        console.log('NoSleep video playing - screen should stay awake');
    } catch (err) {
        console.log('NoSleep video play error:', err);
        noSleepEnabled = false;
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

// Keep-alive mechanism for iOS Safari
// Ensures video playback continues to prevent screen sleep
function startKeepAlive() {
    stopKeepAlive(); // Clear any existing interval
    
    // Enable the NoSleep hidden video for iOS
    enableNoSleep();
    
    // Check every 5 seconds that both videos are still playing when unmuted
    keepAliveInterval = setInterval(() => {
        if (!isMuted) {
            // Check main video
            if (videoElement && videoElement.paused) {
                console.log('Main video paused unexpectedly, restarting...');
                videoElement.play().catch(err => {
                    console.log('Could not restart main video:', err);
                });
            }
            
            // Check NoSleep video
            if (noSleepVideo && noSleepVideo.paused) {
                console.log('NoSleep video paused, restarting...');
                noSleepVideo.play().catch(err => {
                    console.log('Could not restart NoSleep video:', err);
                });
            }
        }
    }, 5000);
    
    console.log('Keep-alive mechanism started');
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

    // Detect iOS Safari to tweak some transforms/z-index behavior
    const ua = window.navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
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
    
    // Clear previous content
    videoFrame.innerHTML = '';
    
    // Create native HTML5 video element with only webm source
    videoElement = document.createElement('video');
    videoElement.autoplay = true;
    videoElement.loop = true;
    videoElement.playsInline = true;
    videoElement.muted = isMuted;
    videoElement.volume = volumeLevel / 100;
    videoElement.preload = 'auto'; // Ensure video is fully loaded

    // Add <source> element for webm only
    const webmSource = document.createElement('source');
    webmSource.src = shuffledVideoFiles[channelIndex].webm;
    webmSource.type = 'video/webm';
    videoElement.appendChild(webmSource);

    // Prevent user from pausing the video
    videoElement.addEventListener('pause', () => {
        if (!videoElement.ended) {
            videoElement.play();
        }
    });

    // Ensure video keeps playing
    videoElement.addEventListener('ended', () => {
        videoElement.play();
    });

    // Style the video element
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';

    // Add to DOM
    videoFrame.appendChild(videoElement);

    // If unmuted, ensure video is unmuted
    if (!isMuted) {
        videoElement.muted = false;
    }

    // Update channel display
    channelDisplay.textContent = `CH ${channelIndex + 1}`;
    
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
    webmSource.addEventListener('error', (e) => {
        console.log(`Source error on channel ${channelIndex + 1}, skipping to next...`, e);
        // Trigger the video element error handler
        videoElement.dispatchEvent(new Event('error'));
    }, { once: true });
    
    // Hide static only after video is ready to play
    videoElement.addEventListener('canplay', () => {
        staticNoise.classList.remove('active');
        stopStaticNoise();
    }, { once: true });
    
    // Force play video immediately
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Autoplay started successfully
            if (!isMuted) {
                videoElement.muted = false;
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

function toggleMute() {
    isMuted = !isMuted;
    if (videoElement) {
        videoElement.muted = isMuted;
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
        if (isMuted && volumeLevel > 0) {
            isMuted = false;
            videoElement.muted = false;
            // Request wake lock and start keep-alive when unmuting via volume adjustment
            requestWakeLock();
            startKeepAlive();
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
function startSpeakerAnimation() {
    stopSpeakerAnimation();
    const left = document.querySelector('.speaker-left');
    const right = document.querySelector('.speaker-right');
    if (!left || !right) return;
    function animate() {
        // Only animate if NOT muted
        if (!isMuted) {
            // Random scale between 1 and 1.10
            const scale = 1 + Math.random() * 0.10;
            left.style.transform = `scaleY(${scale})`;
            right.style.transform = `scaleY(${scale})`;
        } else {
            left.style.transform = '';
            right.style.transform = '';
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
    if (left && right) {
        left.style.transform = '';
        right.style.transform = '';
    }
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
                    // Request wake lock and start keep-alive when unmuting via drag
                    requestWakeLock();
                    startKeepAlive();
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

