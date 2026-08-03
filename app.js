// ---------------------------------------------------------------------------
// Lucide icons
// ---------------------------------------------------------------------------
if (window.lucide) lucide.createIcons();

// ---------------------------------------------------------------------------
// Reveal-on-scroll (IntersectionObserver, threshold 0.15)
// ---------------------------------------------------------------------------
(function setupReveals() {
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = el.getAttribute('data-delay') || '0';
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add('is-visible');
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.15 }
  );
  els.forEach((el) => io.observe(el));
})();

// ---------------------------------------------------------------------------
// Scroll-scrubbed hero video
// ---------------------------------------------------------------------------
(function setupScrollVideo() {
  const VIDEO_URL =
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260729_102822_0e6c87e8-c141-4744-bf32-ad30db296371.mp4';

  const posterImg = document.getElementById('posterImg');
  const visibleVideo = document.getElementById('bgVideo');
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');

  const isMobile = window.matchMedia('(max-width: 768px)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MAX_FRAMES = isMobile ? 28 : 90;
  const MIN_FRAMES = isMobile ? 14 : 24;
  const FRAMES_PER_SEC = isMobile ? 6 : 12;
  const MAX_FRAME_WIDTH = isMobile ? 480 : 960;
  const DPR = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  // On mobile, skip the heavy frame-scrub effect entirely and just let the
  // regular <video> play/scrub directly -- much lighter on CPU/battery.
  const useFrameExtraction = !isMobile && !prefersReducedMotion;

  let frames = [];
  let framesReady = false;
  let smoothed = 0;
  let lastSeekTime = -1;
  let videoHasFrame = false;
  let posterHidden = false;

  // --- canvas sizing -------------------------------------------------------
  function resizeCanvas() {
    canvas.width = Math.round(window.innerWidth * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- object-cover draw helper --------------------------------------------
  function drawCover(source, srcW, srcH) {
    const cw = canvas.width;
    const ch = canvas.height;
    if (!srcW || !srcH) return;
    const scale = Math.max(cw / srcW, ch / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(source, dx, dy, dw, dh);
  }

  // --- fade helpers ---------------------------------------------------------
  function hidePoster() {
    if (posterHidden) return;
    posterHidden = true;
    posterImg.style.opacity = '0';
  }

  function showVisibleVideoLayer() {
    if (!framesReady) {
      visibleVideo.style.opacity = '1';
      canvas.style.opacity = '0';
    }
  }

  function showCanvasLayer() {
    canvas.style.opacity = '1';
    visibleVideo.style.opacity = '0';
  }

  // --- visible video: used for poster-fade trigger + fallback scrubbing ---
  visibleVideo.addEventListener('loadeddata', () => {
    videoHasFrame = true;
    hidePoster();
    showVisibleVideoLayer();
  });

  visibleVideo.addEventListener('error', () => {
    // keep poster visible if the video fails to load
  });

  // --- offscreen frame extraction ------------------------------------------
  function extractFrames() {
    const off = document.createElement('video');
    off.src = VIDEO_URL;
    off.muted = true;
    off.playsInline = true;
    off.preload = 'auto';

    off.addEventListener('loadedmetadata', async () => {
      const duration = off.duration || 0;
      if (!duration || !isFinite(duration)) return;

      const numFrames = Math.min(
        MAX_FRAMES,
        Math.max(MIN_FRAMES, Math.floor(duration * FRAMES_PER_SEC))
      );

      const srcW = off.videoWidth || 1920;
      const srcH = off.videoHeight || 1080;
      const scale = Math.min(1, MAX_FRAME_WIDTH / srcW);
      const w = Math.round(srcW * scale);
      const h = Math.round(srcH * scale);

      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d');

      const collected = [];

      function seekTo(t) {
        return new Promise((resolve) => {
          const onSeeked = () => {
            off.removeEventListener('seeked', onSeeked);
            resolve();
          };
          off.addEventListener('seeked', onSeeked);
          off.currentTime = t;
        });
      }

      for (let i = 0; i < numFrames; i++) {
        const t = Math.min(duration - 0.05, (i / (numFrames - 1)) * duration);
        try {
          await seekTo(Math.max(0, t));
          offCtx.drawImage(off, 0, 0, w, h);
          const bitmap = await createImageBitmap(offCanvas);
          collected.push(bitmap);
        } catch (e) {
          // skip failed frame
        }
      }

      if (collected.length > 0) {
        frames = collected;
        framesReady = true;
        showCanvasLayer();
        hidePoster();
      }
    });
  }

  // Wait for the visible video to have data + 300ms yield before extracting
  if (useFrameExtraction) {
    visibleVideo.addEventListener(
      'loadeddata',
      () => {
        setTimeout(extractFrames, 300);
      },
      { once: true }
    );
  }

  // --- scroll progress + RAF loop -------------------------------------------
  function getProgress() {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return 0;
    const p = window.scrollY / scrollHeight;
    return Math.min(1, Math.max(0, p));
  }

  let lastMobileUpdate = 0;
  const MOBILE_SEEK_INTERVAL = 120; // ms — avoid seeking every single frame on mobile

  function tick(now) {
    const target = getProgress();
    smoothed += (target - smoothed) * 0.12;

    if (framesReady && frames.length > 0) {
      const idx = Math.min(
        frames.length - 1,
        Math.max(0, Math.round(smoothed * (frames.length - 1)))
      );
      const frame = frames[idx];
      drawCover(frame, frame.width, frame.height);
    } else if (videoHasFrame && !isMobile) {
      const duration = visibleVideo.duration;
      if (duration && isFinite(duration)) {
        const seekTarget = smoothed * (duration - 0.05);
        if (Math.abs(seekTarget - lastSeekTime) > 0.04) {
          lastSeekTime = seekTarget;
          try {
            visibleVideo.currentTime = Math.max(0, seekTarget);
          } catch (e) {}
        }
      }
    } else if (videoHasFrame && isMobile) {
      // Throttled + coarser seeking on mobile to save battery/CPU
      if (now - lastMobileUpdate > MOBILE_SEEK_INTERVAL) {
        lastMobileUpdate = now;
        const duration = visibleVideo.duration;
        if (duration && isFinite(duration)) {
          const seekTarget = smoothed * (duration - 0.05);
          if (Math.abs(seekTarget - lastSeekTime) > 0.15) {
            lastSeekTime = seekTarget;
            try {
              visibleVideo.currentTime = Math.max(0, seekTarget);
            } catch (e) {}
          }
        }
      }
    }

    requestAnimationFrame(tick);
  }

  if (!prefersReducedMotion) {
    requestAnimationFrame(tick);
  } else {
    hidePoster();
    showVisibleVideoLayer();
  }
})();
