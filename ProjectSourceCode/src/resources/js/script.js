// src/resources/js/script.js — REPLACE.
// Shutter now lives in the bottom nav (footer.hbs, #take-photo-btn).
//   - On /home (camera page): it takes the photo.
//   - On any other page: it goes to /home, the camera page.
// After a capture, Retake / Use This Photo appear in a floating row
// just above the bottom nav (#capture-actions in home.hbs).
// Upload (top-right) still works: picking a photo auto-submits to
// POST /identify.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('take-photo-form');
  const input = document.querySelector('input[type="file"][name="image"]');

  if (form && input) {
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        form.submit();
      }
    });
  }

  const takeBtn = document.getElementById('take-photo-btn');
  const openBtn = document.getElementById('open-camera-btn');
  const useBtn = document.getElementById('use-photo-btn');
  const retakeBtn = document.getElementById('retake-btn');
  const captureActions = document.getElementById('capture-actions');
  const uploadLabel = document.getElementById('camera-upload-label');
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const placeholder = document.getElementById('camera-placeholder');
  const snapshotImg = document.getElementById('snapshot-preview');
  const errorBox = document.getElementById('camera-error');

  // Not on the camera page: the shutter is just a link to /home.
  if (!video || !canvas) {
    if (takeBtn) {
      takeBtn.addEventListener('click', () => {
        window.location.href = '/home';
      });
    }
    return;
  }

  let stream = null;

  const showError = (message) => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.hidden = true;
  };

  const showLiveView = () => {
    if (placeholder) placeholder.hidden = true;
    if (snapshotImg) snapshotImg.hidden = true;
    if (captureActions) captureActions.hidden = true;
    video.hidden = false;
    if (takeBtn) takeBtn.hidden = false;
    if (openBtn) openBtn.hidden = true;
    if (uploadLabel) uploadLabel.hidden = false;
  };

  const startCamera = async () => {
    if (errorBox) errorBox.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Camera is not available in this browser. Use Upload (top-right) instead.');
      if (openBtn) openBtn.hidden = false;
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      showLiveView();
      return true;
    } catch (err) {
      console.error(err);
      showError('Could not open the camera. Check the browser permission and use Upload (top-right) instead.');
      if (openBtn) openBtn.hidden = false;
      return false;
    }
  };

  // Camera starts automatically on page load.
  startCamera();

  if (openBtn) openBtn.addEventListener('click', startCamera);

  if (takeBtn) {
    takeBtn.addEventListener('click', () => {
      if (!stream || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      snapshotImg.src = canvas.toDataURL('image/jpeg', 0.9);
      snapshotImg.hidden = false;
      stopCamera();
      takeBtn.hidden = true;
      if (captureActions) captureActions.hidden = false;
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', async () => {
      snapshotImg.hidden = true;
      if (captureActions) captureActions.hidden = true;
      await startCamera();
    });
  }

  if (useBtn) {
    useBtn.addEventListener('click', () => {
      if (!form || !input) return;
      canvas.toBlob((blob) => {
        if (!blob) {
          showError('Could not save the photo. Try taking it again.');
          return;
        }
        const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        form.submit();
      }, 'image/jpeg', 0.9);
    });
  }
});
