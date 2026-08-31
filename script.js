// ---------------------------------------------------------------------------
// RSVP form handling.
//
// Submits to our own server (POST /api/rsvp), which stores the RSVP in
// MySQL and relays a copy to Formspree for the email notification. See
// server.js and README.md for setup.
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = "wedding-rsvps";

const form = document.getElementById("rsvp-form");
const statusEl = document.getElementById("rsvp-status");
const submitBtn = document.getElementById("rsvp-submit");

if (form) {
  form.addEventListener("submit", handleSubmit);
}

async function handleSubmit(event) {
  event.preventDefault();
  clearStatus();

  // Honeypot: if this hidden field got filled in, silently drop the submission.
  if (form.company.value) {
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    attending: form.attending.value,
    guests: form.guests.value,
    dietary: form.dietary.value.trim(),
    message: form.message.value.trim(),
  };

  setSubmitting(true);

  try {
    const response = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || `Server returned ${response.status}`);
    }

    form.reset();
    showStatus("Thank you! Your RSVP has been received.", "success");
  } catch (err) {
    console.error(err);
    // Keep a local copy so the response isn't lost entirely, and let
    // whoever's testing know the server didn't confirm it.
    saveLocally({ ...data, submittedAt: new Date().toISOString() });
    showStatus(
      "We couldn't reach the server to save your RSVP. Please try again shortly, or let us know directly.",
      "error"
    );
  } finally {
    setSubmitting(false);
  }
}

function saveLocally(entry) {
  const existing = readLocal();
  existing.push(entry);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? "Sending..." : "Send RSVP";
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "form-status " + type;
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "form-status";
}
