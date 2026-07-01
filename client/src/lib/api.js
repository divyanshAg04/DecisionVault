const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000/api');
const API_CONFIG_ERROR = import.meta.env.PROD && !import.meta.env.VITE_API_URL
  ? 'API URL is not configured. Set VITE_API_URL to your deployed API endpoint.'
  : '';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
  };
}

async function request(url, options = {}) {
  if (API_CONFIG_ERROR) {
    throw new Error(API_CONFIG_ERROR);
  }

  const headers = getHeaders();
  const config = {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...options.headers,
    },
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${url}`, config);
  } catch (error) {
    throw new Error(error?.message === 'Failed to fetch'
      ? 'Server is unavailable. Please check the API connection and try again.'
      : error?.message || 'Network request failed');
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }

  return data;
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch (err) {
    // Ignore cleanup failures
  }
}

export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(name, email, password, examTrack, targetYear) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, examTrack, targetYear }),
  });
}

export async function getMe() {
  return request('/auth/me');
}

export async function updateProfile(profileData) {
  return request('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(profileData),
  });
}

export async function getColleges() {
  return request('/colleges');
}

export async function getShortlists() {
  return request('/shortlists');
}

export async function upsertShortlist(collegeId, data = {}) {
  return request('/shortlists', {
    method: 'POST',
    body: JSON.stringify({
      college: collegeId,
      ...data,
    }),
  });
}

export async function deleteShortlist(shortlistId) {
  return request(`/shortlists/${shortlistId}`, {
    method: 'DELETE',
  });
}

export async function addShortlistNote(shortlistId, body, source = 'User research note') {
  return request(`/shortlists/${shortlistId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body, source }),
  });
}

export async function updateShortlistStatus(shortlistId, status) {
  return request(`/shortlists/${shortlistId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getDecisions() {
  return request('/decisions');
}

export async function createDecision(selectedCollegeId, finalScore, confidence, reasons, reviewDueAt, selectedCollegeSnapshot = null) {
  return request('/decisions', {
    method: 'POST',
    body: JSON.stringify({
      selectedCollege: selectedCollegeId,
      selectedCollegeSnapshot,
      finalScore,
      confidence,
      reasons,
      reviewDueAt,
    }),
  });
}

export async function createReflection(decisionId, satisfaction, placementDataAccurate, wouldChooseAgain, biggestSurprise, biggestRegret) {
  return request('/decisions/reflections', {
    method: 'POST',
    body: JSON.stringify({
      decision: decisionId,
      satisfaction,
      placementDataAccurate,
      wouldChooseAgain,
      biggestSurprise,
      biggestRegret,
    }),
  });
}

export async function getActivities() {
  return request('/activities');
}

export async function summarizeResearch(text) {
  return request('/ai/summarize', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function askGemini(question) {
  return request('/ai/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}
export async function deleteAccount() {
  return request('/auth/account', { method: 'DELETE' });
}

export async function deleteShortlistNote(shortlistId, noteId) {
  return request(`/shortlists/${shortlistId}/notes/${noteId}`, { method: 'DELETE' });
}

export async function predictAdmission({ rank, seatType, gender, quota, limit }) {
  return request('/ml/predict-admission', {
    method: 'POST',
    body: JSON.stringify({ rank, seatType, gender, quota, limit }),
  });
}

export async function savePredictionShortlist(prediction) {
  return request('/shortlists/prediction', {
    method: 'POST',
    body: JSON.stringify(prediction),
  });
}

export async function predictPlacement(profile) {
  return request('/ml/predict-placement', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

