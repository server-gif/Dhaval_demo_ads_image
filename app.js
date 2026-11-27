const storageKey = 'imagelink.cloudinary.settings';
const maxFileSize = 10 * 1024 * 1024;
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');
const cloudNameInput = document.getElementById('cloudName');
const uploadPresetInput = document.getElementById('uploadPreset');
const settingsButton = document.getElementById('settingsButton');
const resetButton = document.getElementById('resetButton');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

let pendingUpload = null;
let sessionConfig = null;
let toastTimer;

const cards = [0, 1].map((index) => ({
  index,
  input: document.getElementById(`file${index}`),
  dropzone: document.getElementById(`dropzone${index}`),
  placeholder: document.getElementById(`placeholder${index}`),
  previewWrap: document.getElementById(`previewWrap${index}`),
  preview: document.getElementById(`preview${index}`),
  status: document.getElementById(`status${index}`),
  progressTrack: document.getElementById(`progressTrack${index}`),
  progressBar: document.getElementById(`progressBar${index}`),
  urlInput: document.getElementById(`url${index}`),
  urlHint: document.getElementById(`urlHint${index}`),
  copyButton: document.getElementById(`copy${index}`),
  changeButton: document.querySelector(`[data-card="${index}"] .change-button`),
  file: null,
  objectUrl: null,
  xhr: null,
  copyTimer: null
}));

function getConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && saved.cloudName && saved.uploadPreset) {
      return saved;
    }
  } catch {
    // Invalid saved settings are treated as missing settings.
  }
  return sessionConfig;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function setStatus(card, message, state = '') {
  card.status.textContent = message;
  card.status.className = `card-status${state ? ` is-${state}` : ''}`;
}

function setHint(card, message, state = '') {
  card.urlHint.textContent = message;
  card.urlHint.className = `url-hint${state ? ` is-${state}` : ''}`;
}

function setProgress(card, percent) {
  card.progressTrack.hidden = false;
  card.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function hideProgress(card) {
  card.progressTrack.hidden = true;
  card.progressBar.style.width = '0%';
}

function updateResetButton() {
  resetButton.disabled = !cards.some((card) => card.file);
}

function resetCopyState(card) {
  clearTimeout(card.copyTimer);
  card.copyButton.classList.remove('is-copied');
  card.copyButton.querySelector('span').textContent = 'Copy';
  card.copyButton.disabled = true;
}

function abortUpload(card) {
  if (card.xhr) {
    card.xhr.abort();
    card.xhr = null;
  }
}

function clearCard(card, keepFile = false) {
  abortUpload(card);
  resetCopyState(card);

  if (card.objectUrl) {
    URL.revokeObjectURL(card.objectUrl);
    card.objectUrl = null;
  }

  if (!keepFile) {
    card.file = null;
    card.input.value = '';
  }

  card.preview.removeAttribute('src');
  card.previewWrap.hidden = true;
  card.placeholder.hidden = false;
  card.changeButton.hidden = true;
  card.urlInput.value = '';
  card.urlHint.textContent = 'Ready when your upload is complete.';
  card.urlHint.className = 'url-hint';
  hideProgress(card);
  setStatus(card, 'Waiting for an image');
  updateResetButton();
}

function openSettings(pendingCard = null) {
  const config = getConfig();
  cloudNameInput.value = config?.cloudName || '';
  uploadPresetInput.value = config?.uploadPreset || '';
  cloudNameInput.removeAttribute('aria-invalid');
  uploadPresetInput.removeAttribute('aria-invalid');
  document.getElementById('cloudNameError').hidden = true;
  document.getElementById('uploadPresetError').hidden = true;
  pendingUpload = pendingCard;
  settingsDialog.showModal();
  setTimeout(() => cloudNameInput.focus(), 0);
}

function closeSettings() {
  const card = pendingUpload;
  pendingUpload = null;
  settingsDialog.close();

  if (card?.file) {
    setStatus(card, 'Connection needed', 'error');
    setHint(card, 'Open connection settings to upload this image.', 'error');
  }
}

function validateFile(file) {
  if (!acceptedTypes.includes(file.type)) {
    return 'Choose a JPG, PNG, WEBP, or GIF image.';
  }
  if (file.size > maxFileSize) {
    return 'This image is larger than 10 MB. Choose a smaller file.';
  }
  return '';
}

function previewFile(card, file) {
  abortUpload(card);
  clearCard(card, true);
  card.file = file;

  if (card.objectUrl) {
    URL.revokeObjectURL(card.objectUrl);
  }
  card.objectUrl = URL.createObjectURL(file);
  card.preview.src = card.objectUrl;
  card.previewWrap.hidden = false;
  card.placeholder.hidden = true;
  card.changeButton.hidden = false;
  setStatus(card, 'Ready to upload');
  setHint(card, 'Uploading will create a public link.');
  updateResetButton();
}

function uploadImage(card) {
  const config = getConfig();
  if (!card.file) {
    return;
  }
  if (!config) {
    openSettings(card);
    return;
  }

  const validationError = validateFile(card.file);
  if (validationError) {
    handleUploadError(card, validationError);
    return;
  }

  abortUpload(card);
  resetCopyState(card);
  card.urlInput.value = '';
  setStatus(card, `Uploading 0%`, 'uploading');
  setHint(card, 'Creating your public link…');
  setProgress(card, 0);

  const formData = new FormData();
  formData.append('file', card.file);
  formData.append('upload_preset', config.uploadPreset);

  const xhr = new XMLHttpRequest();
  card.xhr = xhr;
  xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`);
  xhr.timeout = 60000;

  xhr.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      setStatus(card, `Uploading ${percent}%`, 'uploading');
      setProgress(card, percent);
    }
  });

  xhr.addEventListener('load', () => {
    if (card.xhr !== xhr) {
      return;
    }
    card.xhr = null;
    let result;
    try {
      result = JSON.parse(xhr.responseText);
    } catch {
      handleUploadError(card, 'The hosting service returned an unexpected response. Please try again.');
      return;
    }

    if (xhr.status < 200 || xhr.status >= 300 || !result.secure_url) {
      const message = result?.error?.message || 'Upload failed. Check your Cloudinary settings and try again.';
      handleUploadError(card, message);
      return;
    }

    hideProgress(card);
    card.urlInput.value = result.secure_url;
    card.copyButton.disabled = false;
    setStatus(card, 'Upload complete', 'success');
    setHint(card, 'Your public image is ready to share.', 'success');
    showToast(`Image ${card.index + 1} uploaded successfully`);
  });

  xhr.addEventListener('error', () => {
    if (card.xhr !== xhr) {
      return;
    }
    card.xhr = null;
    handleUploadError(card, 'Could not connect to Cloudinary. Check your internet connection and try again.');
  });

  xhr.addEventListener('timeout', () => {
    if (card.xhr !== xhr) {
      return;
    }
    card.xhr = null;
    handleUploadError(card, 'The upload timed out. Please try again.');
  });

  xhr.addEventListener('abort', () => {
    if (card.xhr !== xhr) {
      return;
    }
    card.xhr = null;
  });

  xhr.send(formData);
}

function handleUploadError(card, message) {
  hideProgress(card);
  setStatus(card, 'Upload failed', 'error');
  setHint(card, message, 'error');
  showToast('Upload failed. Check the message below the URL field.', true);
}

function handleFileSelection(card, file) {
  if (!file) {
    return;
  }

  const validationError = validateFile(file);
  if (validationError) {
    showToast(validationError, true);
    card.input.value = '';
    return;
  }

  previewFile(card, file);

  if (!getConfig()) {
    openSettings(card);
    return;
  }

  uploadImage(card);
}

async function copyUrl(card) {
  if (!card.urlInput.value) {
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(card.urlInput.value);
    } else {
      card.urlInput.focus();
      card.urlInput.select();
      const copied = document.execCommand('copy');
      if (!copied) {
        throw new Error('Copy failed');
      }
    }

    clearTimeout(card.copyTimer);
    card.copyButton.classList.add('is-copied');
    card.copyButton.querySelector('span').textContent = 'Copied';
    showToast(`Image ${card.index + 1} URL copied`);
    card.copyTimer = setTimeout(() => {
      card.copyButton.classList.remove('is-copied');
      card.copyButton.querySelector('span').textContent = 'Copy';
    }, 2200);
  } catch {
    card.urlInput.focus();
    card.urlInput.select();
    showToast('Select the URL and copy it manually.', true);
  }
}

cards.forEach((card) => {
  card.input.addEventListener('change', () => handleFileSelection(card, card.input.files[0]));

  card.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.input.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    card.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      card.dropzone.closest('.upload-card').classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    card.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      card.dropzone.closest('.upload-card').classList.remove('is-dragging');
    });
  });

  card.dropzone.addEventListener('drop', (event) => {
    handleFileSelection(card, event.dataTransfer.files[0]);
  });

  card.changeButton.addEventListener('click', () => card.input.click());
  card.copyButton.addEventListener('click', () => copyUrl(card));
  card.urlInput.addEventListener('click', () => card.urlInput.select());
});

settingsButton.addEventListener('click', () => openSettings());
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('cancelSettings').addEventListener('click', closeSettings);

settingsDialog.addEventListener('click', (event) => {
  if (event.target === settingsDialog) {
    const bounds = settingsDialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) {
      closeSettings();
    }
  }
});

settingsDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSettings();
});

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const cloudName = cloudNameInput.value.trim();
  const uploadPreset = uploadPresetInput.value.trim();
  const cloudNameInvalid = !cloudName;
  const uploadPresetInvalid = !uploadPreset;

  cloudNameInput.setAttribute('aria-invalid', String(cloudNameInvalid));
  uploadPresetInput.setAttribute('aria-invalid', String(uploadPresetInvalid));
  document.getElementById('cloudNameError').hidden = !cloudNameInvalid;
  document.getElementById('uploadPresetError').hidden = !uploadPresetInvalid;

  if (cloudNameInvalid || uploadPresetInvalid) {
    (cloudNameInvalid ? cloudNameInput : uploadPresetInput).focus();
    return;
  }

  sessionConfig = { cloudName, uploadPreset };

  try {
    localStorage.setItem(storageKey, JSON.stringify(sessionConfig));
  } catch {
    showToast('Browser storage is unavailable. Your settings will last for this session only.', true);
  }

  const cardToUpload = pendingUpload;
  settingsDialog.close();
  pendingUpload = null;
  showToast('Cloudinary connection saved');

  if (cardToUpload && cardToUpload.file) {
    uploadImage(cardToUpload);
  }
});

resetButton.addEventListener('click', () => {
  cards.forEach((card) => clearCard(card));
  showToast('Upload form reset');
});
