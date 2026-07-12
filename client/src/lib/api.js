const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (!import.meta.env.PROD) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${hostname}:5000/api`;
  }
  return '';
};

const API_BASE_URL = getApiBaseUrl();
const API_CONFIG_ERROR = import.meta.env.PROD && !import.meta.env.VITE_API_URL
  ? 'API URL is not configured. Set VITE_API_URL to your deployed API endpoint.'
  : '';

let inMemoryCsrfToken = '';

function getCsrfToken() {
  return inMemoryCsrfToken;
}

function getHeaders(method) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (method && method !== 'GET' && method !== 'HEAD') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return headers;
}

async function request(url, options = {}) {
  if (API_CONFIG_ERROR) {
    throw new Error(API_CONFIG_ERROR);
  }

  const headers = getHeaders(options.method);
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
    if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/refresh') && !url.includes('/auth/logout')) {
      try {
        const refreshHeaders = { 'Content-Type': 'application/json' };
        if (inMemoryCsrfToken) {
          refreshHeaders['X-CSRF-Token'] = inMemoryCsrfToken;
        }
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: refreshHeaders,
        });
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          if (refreshData && refreshData.csrfToken) {
            inMemoryCsrfToken = refreshData.csrfToken;
          }
          config.headers['X-CSRF-Token'] = inMemoryCsrfToken;
          response = await fetch(`${API_BASE_URL}${url}`, config);
        }
      } catch (refreshErr) {
        console.warn('Silent token refresh failed:', refreshErr);
      }
    }
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

  if (data && data.csrfToken) {
    inMemoryCsrfToken = data.csrfToken;
  }

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

export async function getShortlists(userId) {
  return request(userId ? `/shortlists?userId=${userId}` : '/shortlists');
}

export async function upsertShortlist(collegeId, data = {}, userId) {
  return request(userId ? `/shortlists?userId=${userId}` : '/shortlists', {
    method: 'POST',
    body: JSON.stringify({
      college: collegeId,
      ...data,
    }),
  });
}

export async function deleteShortlist(shortlistId, userId) {
  return request(userId ? `/shortlists/${shortlistId}?userId=${userId}` : `/shortlists/${shortlistId}`, {
    method: 'DELETE',
  });
}

export async function addShortlistNote(shortlistId, body, source = 'User research note', userId) {
  return request(userId ? `/shortlists/${shortlistId}/notes?userId=${userId}` : `/shortlists/${shortlistId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body, source }),
  });
}

export async function updateShortlistStatus(shortlistId, status, userId) {
  return request(userId ? `/shortlists/${shortlistId}/status?userId=${userId}` : `/shortlists/${shortlistId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getDecisions(userId) {
  return request(userId ? `/decisions?userId=${userId}` : '/decisions');
}

export async function createDecision(selectedCollegeId, finalScore, confidence, reasons, reviewDueAt, selectedCollegeSnapshot = null, userId) {
  return request(userId ? `/decisions?userId=${userId}` : '/decisions', {
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

export async function createReflection(decisionId, satisfaction, placementDataAccurate, wouldChooseAgain, biggestSurprise, biggestRegret, userId) {
  return request(userId ? `/decisions/reflections?userId=${userId}` : '/decisions/reflections', {
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

export async function getActivities(userId) {
  return request(userId ? `/activities?userId=${userId}` : '/activities');
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

export async function deleteShortlistNote(shortlistId, noteId, userId) {
  return request(userId ? `/shortlists/${shortlistId}/notes/${noteId}?userId=${userId}` : `/shortlists/${shortlistId}/notes/${noteId}`, { method: 'DELETE' });
}

export async function predictAdmission({ rank, seatType, gender, quota, limit }) {
  return request('/ml/predict-admission', {
    method: 'POST',
    body: JSON.stringify({ rank, seatType, gender, quota, limit }),
  });
}

export async function savePredictionShortlist(prediction, userId) {
  return request(userId ? `/shortlists/prediction?userId=${userId}` : '/shortlists/prediction', {
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

export async function resendVerification() {
  return request('/auth/resend-verification', {
    method: 'POST',
  });
}

export async function verifyEmail(otp) {
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });
}

// Collaborator API Helpers
export async function inviteCollaborator(email, role) {
  return request('/collaborators/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function getInvitations() {
  return request('/collaborators/invitations');
}

export async function respondToInvitation(inviteId, accept) {
  return request(`/collaborators/invitations/${inviteId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}

export async function getSharedWorkspaces() {
  return request('/collaborators/shares');
}

export async function removeShare(shareId) {
  return request(`/collaborators/shares/${shareId}`, {
    method: 'DELETE',
  });
}
