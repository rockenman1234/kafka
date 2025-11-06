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
    }
    // Add more video file objects as needed
];

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


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
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

    // Add <source> element for webm only
    const webmSource = document.createElement('source');
    webmSource.src = videoFiles[channelIndex].webm;
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
        if (currentChannel >= videoFiles.length) {
            currentChannel = 0;
        } else if (currentChannel < 0) {
            currentChannel = videoFiles.length - 1;
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
}

function adjustVolume(delta) {
    volumeLevel = Math.max(0, Math.min(100, volumeLevel + delta));
    if (videoElement) {
        videoElement.volume = volumeLevel / 100;
        if (isMuted && volumeLevel > 0) {
            isMuted = false;
            videoElement.muted = false;
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
    // Start or stop animation based on mute state
    if (!isMuted) {
        startSpeakerAnimation();
    } else {
        stopSpeakerAnimation();
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
    
    // Position tooltip to the right of the volume knob
    tooltip.style.left = `${knobRect.right + 20}px`;
    tooltip.style.top = `${knobRect.top + (knobRect.height / 2) - (tooltip.offsetHeight / 2)}px`;
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

