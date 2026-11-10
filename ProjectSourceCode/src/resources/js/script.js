// src/resources/js/script.js — REPLACE (was empty on GitHub).
// Auto-submit the Take Photo form on home.hbs as soon as the user
// picks a photo, so the camera button actually identifies the plant
// instead of sitting there waiting for a submit button that isn't there.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.take-photo-form');
  const input = form && form.querySelector('input[type="file"][name="image"]');
  if (form && input) {
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        form.submit();
      }
    });
  }
});
