import {
  BarChart3,
  BookOpenCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Timer,
  Trash2,
  Upload,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { colleges as fallbackColleges, defaultPriorities } from './data/colleges';

// Custom Components
import LandingPage from './components/LandingPage';
import LoginScreen from './components/LoginScreen';
import JourneyScreen from './components/JourneyScreen';
import { OnboardingScreen, Class12OnboardingScreen } from './components/OnboardingScreen';
import { Metric, CompareRow } from './components/Common';
import {
  getColleges,
  login,
  register,
  getMe,
  updateProfile,
  getShortlists,
  upsertShortlist,
  deleteShortlist,
  addShortlistNote,
  updateShortlistStatus,
  getDecisions,
  createDecision,
  createReflection,
  getActivities,
  summarizeResearch,
  askGemini,
  logout,
  deleteAccount,
  deleteShortlistNote,
  predictAdmission,
  predictPlacement
} from './lib/api';

const formatFee = (value) => Number.isFinite(value) && value > 0
  ? `INR ${(value / 100000).toFixed(value >= 100000 ? 2 : 1)}L`
  : 'Dataset only';
const formatPackage = (value) => Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} LPA` : 'Dataset only';

function normalizeMetric(college, metric, catalog) {
  const values = catalog.map((item) => Number(item[metric])).filter(Number.isFinite);
  if (!values.length) return 1;

  const metricValue = Number(college[metric]);
  if (!Number.isFinite(metricValue)) return 0.5;

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) return 1;

  if (metric === 'fees' || metric === 'distanceKm' || metric === 'cutoff') {
    return (max - metricValue) / (max - min);
  }

  return (metricValue - min) / (max - min);
}

function scoreCollege(college, priorities, catalog) {
  if (college.isDatasetResult && college.mlAdmission?.probability != null) {
    return Math.round(college.mlAdmission.probability);
  }

  const totalWeight = priorities.reduce((sum, priority) => sum + priority.weight, 0);
  const weightedScore = priorities.reduce((sum, priority) => {
    return sum + normalizeMetric(college, priority.key, catalog) * priority.weight;
  }, 0);

  return Math.round((weightedScore / totalWeight) * 100);
}

function checkEligibility(college, profile) {
  if (!profile.score) return { eligible: true, status: 'Not Evaluated', reason: 'No score entered' };

  const scoreVal = Number(profile.score);
  if (isNaN(scoreVal)) return { eligible: true, status: 'Not Evaluated', reason: 'Invalid score value' };

  if (profile.scoreType === 'Board %' || profile.scoreType === 'Percentile') {
    const minRequired = profile.scoreType === 'Board %' ? 70 : 80;
    const ok = scoreVal >= minRequired;
    return {
      eligible: ok,
      status: ok ? 'Eligible' : 'Unlikely',
      reason: ok ? `Score meets minimum requirement of ${minRequired}` : `Score is below minimum requirement of ${minRequired}`
    };
  }

  let categoryMultiplier = 1.0;
  if (profile.category === 'OBC-NCL') categoryMultiplier = 1.35;
  else if (profile.category === 'EWS') categoryMultiplier = 1.2;
  else if (profile.category === 'SC') categoryMultiplier = 2.5;
  else if (profile.category === 'ST') categoryMultiplier = 3.5;
  else if (profile.category === 'PwD') categoryMultiplier = 4.5;

  let homeStateMultiplier = 1.0;
  if (profile.homeState && college.state && profile.homeState.trim().toLowerCase() === college.state.trim().toLowerCase()) {
    homeStateMultiplier = 1.45;
  }

  const adjustedCutoff = Math.round(college.cutoff * categoryMultiplier * homeStateMultiplier);
  const ok = scoreVal <= adjustedCutoff;
  const difference = adjustedCutoff - scoreVal;

  let status = 'Eligible';
  let reason = `Rank ${scoreVal} is below adjusted cutoff ${adjustedCutoff}`;

  if (!ok) {
    if (difference < -2000) {
      status = 'Unlikely';
      reason = `Rank is significantly above adjusted cutoff of ${adjustedCutoff}`;
    } else {
      status = 'High Risk';
      reason = `Rank is slightly above adjusted cutoff of ${adjustedCutoff}`;
    }
  } else if (difference < 1500) {
    status = 'Borderline';
    reason = `Rank is close to adjusted cutoff of ${adjustedCutoff}`;
  }

  return { eligible: ok, status, reason, adjustedCutoff };
}

function normalizeSearchText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapCategoryToSeatType(category) {
  if (!category || category === 'General') return 'OPEN';
  if (category === 'PwD') return 'OPEN';
  return category;
}

function getRankFromProfile(profile) {
  const score = Number(profile.score);
  if (!Number.isFinite(score) || score <= 0) return null;

  if (profile.scoreType === 'Rank') return score;

  // If a user enters a JEE-style rank but the score type was not saved correctly,
  // still use it to load dataset-backed admission guidance.
  if (score > 100) return score;

  return null;
}

function getAdmissionPredictionForCollege(college, predictions) {
  if (!predictions?.length || !college?.name) return null;

  const collegeText = normalizeSearchText(`${college.name} ${college.shortName} ${college.city}`);
  const aliases = {
    IIITL: ['indian institute of information technology lucknow', 'iiit lucknow'],
    DTU: ['delhi technological university'],
    NSUT: ['netaji subhas university of technology'],
    NITD: ['national institute of technology delhi', 'nit delhi'],
    AMU: ['aligarh muslim university'],
  };

  const searchTerms = [
    normalizeSearchText(college.name),
    normalizeSearchText(college.shortName),
    ...(aliases[college.shortName] || []),
  ].filter(Boolean);

  return predictions.find((prediction) => {
    const instituteText = normalizeSearchText(prediction.institute);
    return searchTerms.some((term) => instituteText.includes(term) || collegeText.includes(instituteText));
  }) || null;
}

function getMlAdmissionStatus(probability) {
  if (probability == null) return { label: 'No cutoff match', className: 'ambiguous' };
  if (probability >= 75) return { label: 'Strong ML match', className: 'eligible' };
  if (probability >= 40) return { label: 'Possible ML match', className: 'ambiguous' };
  return { label: 'Reach option', className: 'ineligible' };
}

function makeShortName(institute = '') {
  const words = institute
    .replace(/\([^)]*\)/g, '')
    .split(/\s+/)
    .filter((word) => word && !['of', 'and', 'the', 'for'].includes(word.toLowerCase()));

  return words.slice(0, 4).map((word) => word[0]?.toUpperCase()).join('') || 'COLLEGE';
}

function quotaLabel(quota) {
  if (quota === 'AI') return 'All India';
  if (quota === 'HS') return 'Home State';
  if (quota === 'OS') return 'Other State';
  return quota || 'Cutoff Dataset';
}

function predictionToCollege(row, index) {
  const probability = Number(row.probability) || 0;
  const closingRank = Number(row.closingRank) || 0;
  const openingRank = Number(row.openingRank) || closingRank;

  return {
    id: `cutoff-${normalizeSearchText(`${row.institute}-${row.program}-${row.quota}-${row.seatType}-${row.gender}-${index}`).replace(/\s+/g, '-')}`,
    name: row.institute,
    shortName: makeShortName(row.institute),
    type: 'Cutoff Dataset Result',
    branch: row.program,
    state: quotaLabel(row.quota),
    city: quotaLabel(row.quota),
    fees: null,
    avgPackage: null,
    medianPackage: null,
    placementRate: null,
    nirfRank: closingRank || 999999,
    hostel: null,
    cutoff: closingRank,
    distanceKm: null,
    campusLife: null,
    faculty: null,
    research: null,
    roi: probability,
    confidence: probability,
    tags: [row.quota, row.seatType, row.gender, 'cutoff dataset'].filter(Boolean),
    pros: [
      `${probability}% admission likelihood for the entered rank`,
      `Closing rank ${closingRank} in the selected seat filter`,
    ],
    cons: [
      'Fees, hostel, placement, and campus details need manual verification',
    ],
    notes: [],
    rawNotes: [],
    customLinks: [],
    researchLinks: [],
    status: 'dataset-result',
    isDatasetResult: true,
    mlAdmission: {
      ...row,
      openingRank,
      closingRank,
      probability,
    },
    mlAdmissionStatus: getMlAdmissionStatus(probability),
  };
}

function App() {
  const [catalog, setCatalog] = useState(fallbackColleges);
  const [appStage, setAppStage] = useState('landing');
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [admissionProfile, setAdmissionProfile] = useState({
    journey: 'Entrance result ready',
    exam: 'JEE Main',
    scoreType: 'Rank',
    score: '8900',
    category: 'General',
    homeState: 'Uttar Pradesh',
    preferredBranches: 'Computer Science, Computer Engineering',
    fileName: '',
    scorecardBase64: '',
  });
  const [activeSection, setActiveSection] = useState('dashboard');

  // Theme state and toggle
  const [theme, setTheme] = useState(() => localStorage.getItem('dv-theme') || 'light');
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  useEffect(() => {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem('dv-theme', theme);
  }, [theme]);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [shortlistedIds, setShortlistedIds] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [priorities, setPriorities] = useState(defaultPriorities);
  const [decisionId, setDecisionId] = useState('');

  // Vault inputs state
  const [newPro, setNewPro] = useState('');
  const [newCon, setNewCon] = useState('');
  const [newNote, setNewNote] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState('Official');

  // Final decision confirm / reflection state
  const [hasConfirmedDecision, setHasConfirmedDecision] = useState(false);
  const [confirmedDecisionId, setConfirmedDecisionId] = useState('');
  const [satisfaction, setSatisfaction] = useState(8);
  const [placementAccurate, setPlacementAccurate] = useState(true);
  const [chooseAgain, setChooseAgain] = useState(true);
  const [surprise, setSurprise] = useState('');
  const [regret, setRegret] = useState('');
  const [hasReflected, setHasReflected] = useState(false);
  const [reflectionData, setReflectionData] = useState(null);

  // Flagship features state
  const [activities, setActivities] = useState([]);
  const [aiInputText, setAiInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // Gemini QA state
  const [geminiQuestion, setGeminiQuestion] = useState('');
  const [geminiAnswer, setGeminiAnswer] = useState('');
  const [geminiQaLoading, setGeminiQaLoading] = useState(false);

  // Toast notification state
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // ML Predictor Panel states
  const [jeeRank, setJeeRank] = useState('');
  const [jeeCategory, setJeeCategory] = useState('OPEN');
  const [jeeGender, setJeeGender] = useState('Gender-Neutral');
  const [jeeQuota, setJeeQuota] = useState('AI');
  const [admissionPredictions, setAdmissionPredictions] = useState([]);
  const [predictingAdmission, setPredictingAdmission] = useState(false);
  const [mlError, setMlError] = useState('');
  const [mlLastRunAt, setMlLastRunAt] = useState('');

  const [studentGender, setStudentGender] = useState('Male');
  const [studentAge, setStudentAge] = useState(21);
  const [studentDegree, setStudentDegree] = useState('BTech');
  const [studentBranch, setStudentBranch] = useState('CS');
  const [studentCgpa, setStudentCgpa] = useState(8.0);
  const [studentBacklogs, setStudentBacklogs] = useState(0);
  const [studentInternships, setStudentInternships] = useState(1);
  const [studentCertifications, setStudentCertifications] = useState(2);
  const [studentCodingSkills, setStudentCodingSkills] = useState(7);
  const [studentCommunicationSkills, setStudentCommunicationSkills] = useState(7);
  const [studentAptitudeScore, setStudentAptitudeScore] = useState(75);
  const [studentProjects, setStudentProjects] = useState(2);
  const [placementPrediction, setPlacementPrediction] = useState(null);
  const [predictingPlacement, setPredictingPlacement] = useState(false);

  // Profile edit panel state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfile, setEditProfile] = useState({});

  const openProfileEdit = () => {
    setEditProfile({ ...admissionProfile });
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const { user, ocrExtracted } = await updateProfile({
        journey: editProfile.journey,
        exam: editProfile.exam,
        scoreType: editProfile.scoreType,
        score: editProfile.score,
        category: editProfile.category,
        homeState: editProfile.homeState,
        preferredBranches: editProfile.preferredBranches,
        scorecardName: editProfile.fileName || '',
        scorecardBase64: editProfile.scorecardBase64 || '',
      });
      if (ocrExtracted) {
        setEditProfile(p => ({ ...p, score: ocrExtracted.score, scoreType: ocrExtracted.scoreType }));
        showToast(`OCR auto-filled: ${ocrExtracted.score} (${ocrExtracted.scoreType})`, 'success');
      }
      setCurrentUser(user);
      setAdmissionProfile({ ...editProfile });
      setIsEditingProfile(false);
      showToast('Profile updated successfully!', 'success');
    } catch (err) {
      showToast('Failed to update profile: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditProfile(p => ({ ...p, fileName: file.name, scorecardBase64: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleAskGemini = async (e) => {
    e.preventDefault();
    const query = geminiQuestion.trim();
    if (!query) return;
    if (query.length < 3) {
      showToast('Please type a longer question (minimum 3 characters).', 'error');
      return;
    }
    setGeminiQaLoading(true);
    setGeminiAnswer('');
    try {
      const data = await askGemini(query);
      setGeminiAnswer(data.answer);
    } catch (err) {
      showToast('Failed to get answer from Gemini: ' + err.message, 'error');
    } finally {
      setGeminiQaLoading(false);
    }
  };

  const handleAiSummarize = async (e) => {
    e.preventDefault();
    const trimmedText = aiInputText.trim();
    if (!trimmedText) return;
    if (trimmedText.length < 5) {
      showToast('Please enter a longer research note (minimum 5 characters).', 'error');
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const data = await summarizeResearch(trimmedText);
      setAiResult(data);
      showToast('Gemini summarized the research successfully!', 'success');
    } catch (err) {
      showToast('AI Summarization failed: ' + err.message, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleImportAiInsights = async () => {
    if (!aiResult || !selectedCollege.shortlistId) return;
    const mergedPros = [...new Set([...selectedCollege.pros, ...aiResult.pros])];
    const mergedCons = [...new Set([...selectedCollege.cons, ...aiResult.cons])];
    try {
      setIsLoading(true);
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: mergedPros,
        cons: mergedCons,
        confidence: aiResult.confidence,
        priorities,
        researchLinks: selectedCollege.customLinks || [],
      });
      setCatalog((current) =>
        current.map((c) => (c.id === selectedCollege.id ? { ...c, pros: shortlist.pros, cons: shortlist.cons, confidence: shortlist.confidence } : c))
      );
      setAiResult(null);
      setAiInputText('');
      await refreshActivities();
      showToast('AI Insights imported into ' + selectedCollege.shortName + ' vault!', 'success');
    } catch (err) {
      showToast('Failed to import AI insights: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshActivities = async () => {
    try {
      const data = await getActivities();
      setActivities(data.activities || []);
    } catch (err) {
      console.error('Failed to reload activities timeline:', err);
    }
  };

  const loadUserData = async () => {
    try {
      setIsLoading(true);
      const [collegesData, shortlistsData, decisionsData, activitiesData] = await Promise.all([
        getColleges(),
        getShortlists(),
        getDecisions(),
        getActivities(),
      ]);

      const shortlists = shortlistsData.shortlists || [];
      const dbColleges = collegesData.colleges || [];
      setActivities(activitiesData.activities || []);

      const sIds = [];
      const mergedCatalog = dbColleges.map((c) => {
        const fallback = fallbackColleges.find((item) => item.shortName === c.shortName);
        const sl = shortlists.find((item) => item.college && item.college.shortName === c.shortName);

        const id = fallback?.id || c._id || c.shortName;
        if (sl) {
          sIds.push(id);
        }

        return {
          ...c,
          id,
          apiId: c._id,
          shortlistId: sl?._id || null,
          confidence: sl ? sl.confidence : (fallback?.confidence || 70),
          pros: sl && sl.pros?.length ? sl.pros : (fallback?.pros || c.pros || []),
          cons: sl && sl.cons?.length ? sl.cons : (fallback?.cons || c.cons || []),
          notes: sl && sl.notes?.length ? sl.notes.map((n) => n.body) : (fallback?.notes || []),
          rawNotes: sl ? sl.notes : [],
          customLinks: sl?.researchLinks || [],
          researchLinks: [...(sl?.researchLinks || []), ...(fallback?.researchLinks || c.researchLinks || [])],
          status: sl ? sl.status : 'search',
        };
      });

      setCatalog(mergedCatalog.length ? mergedCatalog : fallbackColleges);
      setShortlistedIds(sIds);

      if (sIds.length) {
        setSelectedId(sIds[0]);
        const latestDecision = decisionsData.decisions?.[0];
        if (latestDecision && latestDecision.selectedCollege) {
          const matchedCol = mergedCatalog.find((c) => c.apiId === latestDecision.selectedCollege._id);
          if (matchedCol) {
            setDecisionId(matchedCol.id);
            setConfirmedDecisionId(latestDecision._id);
            setHasConfirmedDecision(true);
          } else {
            setDecisionId(sIds[0]);
          }
        } else if (latestDecision?.selectedCollegeSnapshot?.name) {
          setConfirmedDecisionId(latestDecision._id);
          setHasConfirmedDecision(true);
          if (sIds.length) setDecisionId(sIds[0]);
        } else {
          setDecisionId(sIds[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getMe()
      .then(({ user }) => {
        setCurrentUser(user);
        if (user.journey) {
          setAdmissionProfile({
            journey: user.journey || 'Entrance result ready',
            exam: user.exam || 'JEE Main',
            scoreType: user.scoreType || 'Rank',
            score: user.score || '8900',
            category: user.category || 'General',
            homeState: user.homeState || '',
            preferredBranches: user.preferredBranches || '',
            stream: user.stream || '',
            budget: user.budget || '',
            targetExam: user.targetExam || '',
            fileName: user.scorecardName || '',
            scorecardBase64: user.scorecardBase64 || '',
          });
          loadUserData();
          setAppStage('dashboard');
        } else {
          setAppStage('journey');
        }
      })
      .catch(() => {
        setAppStage('landing');
      });
  }, []);

  // Sync priorities to shortlist in DB (debounced)
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(async () => {
      try {
        const promises = catalog
          .filter((c) => shortlistedIds.includes(c.id) && c.apiId)
          .map((c) =>
            upsertShortlist(c.apiId, {
              confidence: c.confidence,
              pros: c.pros,
              cons: c.cons,
              priorities: priorities,
              researchLinks: c.customLinks || [],
            }),
          );
        await Promise.all(promises);
      } catch (err) {
        console.error('Failed to sync priorities to DB:', err);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [priorities, shortlistedIds, currentUser]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.journey) {
      setAdmissionProfile({
        journey: user.journey,
        exam: user.exam,
        scoreType: user.scoreType,
        score: user.score,
        category: user.category,
        homeState: user.homeState,
        preferredBranches: user.preferredBranches,
        stream: user.stream || '',
        budget: user.budget || '',
        targetExam: user.targetExam || '',
        fileName: user.scorecardName || '',
        scorecardBase64: user.scorecardBase64 || '',
      });
      loadUserData();
      setAppStage('dashboard');
    } else {
      setAppStage('journey');
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setAppStage('landing');
    setCatalog(fallbackColleges);
    setShortlistedIds([]);
    setSelectedId('');
    setDecisionId('');
    setAdmissionPredictions([]);
    setHasConfirmedDecision(false);
    setConfirmedDecisionId('');
    setHasReflected(false);
    setReflectionData(null);
    setActivities([]);
  };

  // New: Delete Account handler
  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure you want to permanently delete your account? This action cannot be undone.')) return;
    try {
      await deleteAccount();
      // Perform same cleanup as logout
      await handleLogout();
      showToast('Account deleted. You have been logged out.', 'success');
    } catch (err) {
      showToast('Failed to delete account: ' + err.message, 'error');
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      setIsLoading(true);
      const { user, ocrExtracted } = await updateProfile({
        journey: admissionProfile.journey,
        exam: admissionProfile.exam,
        scoreType: admissionProfile.scoreType,
        score: admissionProfile.score,
        category: admissionProfile.category,
        homeState: admissionProfile.homeState,
        preferredBranches: admissionProfile.preferredBranches,
        stream: admissionProfile.stream || '',
        budget: admissionProfile.budget || '',
        targetExam: admissionProfile.targetExam || '',
        scorecardName: admissionProfile.fileName || '',
        scorecardBase64: admissionProfile.scorecardBase64 || '',
      });

      if (ocrExtracted) {
        showToast(`Scorecard parsed! Score: ${ocrExtracted.score} (${ocrExtracted.scoreType})`, 'success');
        setAdmissionProfile((current) => ({
          ...current,
          score: ocrExtracted.score,
          scoreType: ocrExtracted.scoreType,
        }));
      }

      setCurrentUser(user);

      await loadUserData();
      setAppStage('dashboard');
    } catch (err) {
      showToast('Failed to complete onboarding: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAdmissionProfile((current) => ({
        ...current,
        fileName: file.name,
        scorecardBase64: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddPro = async (e) => {
    e.preventDefault();
    if (!newPro.trim() || !selectedCollege.shortlistId) return;
    const updatedPros = [...selectedCollege.pros, newPro.trim()];
    try {
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: updatedPros,
        cons: selectedCollege.cons,
        confidence: selectedCollege.confidence,
        priorities,
        researchLinks: selectedCollege.customLinks || [],
      });
      setCatalog((current) =>
        current.map((c) => (c.id === selectedCollege.id ? { ...c, pros: shortlist.pros } : c))
      );
      setNewPro('');
      await refreshActivities();
    } catch (err) {
      showToast('Failed to add pro: ' + err.message, 'error');
    }
  };

  const handleDeletePro = async (pro) => {
    if (!selectedCollege.shortlistId) return;
    const updatedPros = selectedCollege.pros.filter(p => p !== pro);
    try {
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: updatedPros,
        cons: selectedCollege.cons,
        confidence: selectedCollege.confidence,
        priorities,
        researchLinks: selectedCollege.customLinks || [],
      });
      setCatalog(c => c.map(col => col.id === selectedCollege.id ? { ...col, pros: shortlist.pros } : col));
      showToast('Pro removed.', 'success');
    } catch (err) {
      showToast('Failed to delete pro: ' + err.message, 'error');
    }
  };

  const handleAddCon = async (e) => {
    e.preventDefault();
    if (!newCon.trim() || !selectedCollege.shortlistId) return;
    const updatedCons = [...selectedCollege.cons, newCon.trim()];
    try {
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: selectedCollege.pros,
        cons: updatedCons,
        confidence: selectedCollege.confidence,
        priorities,
        researchLinks: selectedCollege.customLinks || [],
      });
      setCatalog((current) =>
        current.map((c) => (c.id === selectedCollege.id ? { ...c, cons: shortlist.cons } : c))
      );
      setNewCon('');
      await refreshActivities();
    } catch (err) {
      showToast('Failed to add con: ' + err.message, 'error');
    }
  };

  const handleDeleteCon = async (con) => {
    if (!selectedCollege.shortlistId) return;
    const updatedCons = selectedCollege.cons.filter(c => c !== con);
    try {
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: selectedCollege.pros,
        cons: updatedCons,
        confidence: selectedCollege.confidence,
        priorities,
        researchLinks: selectedCollege.customLinks || [],
      });
      setCatalog(c => c.map(col => col.id === selectedCollege.id ? { ...col, cons: shortlist.cons } : col));
      showToast('Con removed.', 'success');
    } catch (err) {
      showToast('Failed to delete con: ' + err.message, 'error');
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedCollege.shortlistId) return;
    try {
      const { shortlist } = await addShortlistNote(selectedCollege.shortlistId, newNote.trim(), 'User research note');
      setCatalog((current) =>
        current.map((c) =>
          c.id === selectedCollege.id
            ? { ...c, notes: shortlist.notes.map((n) => n.body), rawNotes: shortlist.notes }
            : c
        )
      );
      setNewNote('');
      await refreshActivities();
    } catch (err) {
      showToast('Failed to add note: ' + err.message, 'error');
    }
  };

  // New: Delete Note handler
  const handleDeleteNote = async (noteId) => {
    if (!selectedCollege.shortlistId) return;
    try {
      await deleteShortlistNote(selectedCollege.shortlistId, noteId);
      // Refresh shortlist data for this college
      const updated = await getShortlists(); // fetch fresh data
      // Find updated shortlist for this college
      const updatedShortlist = updated.shortlists.find(s => s._id === selectedCollege.shortlistId);
      if (updatedShortlist) {
        setCatalog((current) =>
          current.map((c) =>
            c.id === selectedCollege.id
              ? { ...c, notes: updatedShortlist.notes.map((n) => n.body), rawNotes: updatedShortlist.notes }
              : c
          )
        );
        await refreshActivities();
      }
    } catch (err) {
      showToast('Failed to delete note: ' + err.message, 'error');
    }
  };

  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim() || !selectedCollege.shortlistId) return;
    const existingCustom = selectedCollege.customLinks || [];
    const updatedCustom = [...existingCustom, { label: linkTitle.trim(), type: linkType, url: linkUrl.trim() }];
    try {
      const { shortlist } = await upsertShortlist(selectedCollege.apiId, {
        pros: selectedCollege.pros,
        cons: selectedCollege.cons,
        confidence: selectedCollege.confidence,
        priorities,
        researchLinks: updatedCustom,
      });
      setCatalog((current) =>
        current.map((c) => {
          if (c.id === selectedCollege.id) {
            return {
              ...c,
              customLinks: shortlist.researchLinks || [],
              researchLinks: [
                ...(shortlist.researchLinks || []),
                ...(fallbackColleges.find((item) => item.shortName === c.shortName)?.researchLinks || []),
              ],
            };
          }
          return c;
        })
      );
      setLinkTitle('');
      setLinkUrl('');
      await refreshActivities();
    } catch (err) {
      showToast('Failed to add link: ' + err.message, 'error');
    }
  };

  const handleConfirmDecision = async () => {
    if (!finalCollege?.name) return;
    try {
      setIsLoading(true);
      const reviewDate = new Date();
      reviewDate.setMonth(reviewDate.getMonth() + 6);
      const decisionSnapshot = finalCollege.apiId ? null : {
        name: finalCollege.name,
        shortName: finalCollege.shortName,
        program: finalCollege.branch,
        quota: finalCollege.mlAdmission?.quota,
        seatType: finalCollege.mlAdmission?.seatType,
        gender: finalCollege.mlAdmission?.gender,
        openingRank: finalCollege.mlAdmission?.openingRank,
        closingRank: finalCollege.mlAdmission?.closingRank,
        probability: finalCollege.mlAdmission?.probability,
        source: finalCollege.isDatasetResult ? 'cutoff-dataset' : 'local',
      };

      const { decision } = await createDecision(
        finalCollege.apiId || null,
        finalCollege.score,
        finalCollege.confidence,
        finalCollege.isDatasetResult
          ? [`Selected from cutoff dataset for rank ${admissionProfile.score}: ${finalCollege.branch}, closing rank ${finalCollege.mlAdmission?.closingRank}, admission signal ${finalCollege.mlAdmission?.probability}%.`]
          : [`Selected during onboarding based on fit score of ${finalCollege.score}% against family priorities.`],
        reviewDate,
        decisionSnapshot
      );

      setConfirmedDecisionId(decision._id);
      setHasConfirmedDecision(true);
      await refreshActivities();
      showToast('Decision for ' + finalCollege.name + ' confirmed & saved!', 'success');
    } catch (err) {
      showToast('Failed to save decision: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReflection = async (e) => {
    e.preventDefault();
    if (!confirmedDecisionId) {
      showToast('Please confirm your college decision first before recording a reflection.', 'error');
      return;
    }
    try {
      setIsLoading(true);
      const { reflection } = await createReflection(
        confirmedDecisionId,
        Number(satisfaction),
        placementAccurate,
        chooseAgain,
        surprise,
        regret
      );
      setReflectionData(reflection);
      setHasReflected(true);
      await refreshActivities();
      showToast('6-month reflection logged successfully!', 'success');
    } catch (err) {
      showToast('Failed to save reflection: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const datasetCatalog = useMemo(
    () => admissionPredictions.map((prediction, index) => predictionToCollege(prediction, index)),
    [admissionPredictions],
  );
  const activeCatalog = datasetCatalog.length ? datasetCatalog : catalog;
  const isDatasetDiscovery = datasetCatalog.length > 0;

  const states = ['All', ...new Set(activeCatalog.map((college) => college.state))];
  const branches = ['All', ...new Set(activeCatalog.map((college) => college.branch))];

  const scoredColleges = useMemo(() => {
    return activeCatalog
      .map((college) => {
        const eligibilityInfo = checkEligibility(college, admissionProfile);
        const mlAdmission = college.mlAdmission || getAdmissionPredictionForCollege(college, admissionPredictions);
        const mlAdmissionStatus = getMlAdmissionStatus(mlAdmission?.probability);
        return {
          ...college,
          score: scoreCollege({ ...college, mlAdmission }, priorities, activeCatalog),
          eligibility: eligibilityInfo,
          mlAdmission,
          mlAdmissionStatus,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeCatalog, priorities, admissionProfile, admissionPredictions]);

  const filteredColleges = scoredColleges.filter((college) => {
    const searchTarget = `${college.name} ${college.shortName} ${college.branch} ${college.state} ${college.tags.join(' ')}`.toLowerCase();
    const matchesQuery = searchTarget.includes(query.toLowerCase());
    const matchesState = stateFilter === 'All' || college.state === stateFilter;
    const matchesBranch = branchFilter === 'All' || college.branch === branchFilter;
    return matchesQuery && matchesState && matchesBranch;
  });

  const shortlisted = scoredColleges.filter((college) => shortlistedIds.includes(college.id));
  const selectedCollege = scoredColleges.find((college) => college.id === selectedId) || scoredColleges[0] || { name: '', shortName: '', score: 0, pros: [], cons: [], tags: [], researchLinks: [] };
  const finalCollege = scoredColleges.find((college) => college.id === decisionId) || selectedCollege || { name: '', shortName: '', score: 0, confidence: 0 };
  const topMlPrediction = admissionPredictions[0] || null;
  const bestMlCollege = scoredColleges.find((college) => college.mlAdmission) || null;
  const mlMatchedShortlistCount = shortlisted.filter((college) => college.mlAdmission).length;

  useEffect(() => {
    if (!datasetCatalog.length) return;

    const datasetIds = datasetCatalog.map((college) => college.id);
    const currentDatasetShortlist = shortlistedIds.filter((id) => datasetIds.includes(id));
    const defaultShortlist = datasetIds.slice(0, Math.min(5, datasetIds.length));

    if (!datasetIds.includes(selectedId)) {
      setSelectedId(datasetIds[0]);
    }

    if (!datasetIds.includes(decisionId)) {
      setDecisionId(datasetIds[0]);
    }

    if (!currentDatasetShortlist.length) {
      setShortlistedIds(defaultShortlist);
    }
  }, [datasetCatalog, shortlistedIds, selectedId, decisionId]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={18} /> },
    { id: 'onboarding', label: 'Onboarding', icon: <Pencil size={18} /> },
    { id: 'search', label: 'College Discovery', icon: <Search size={18} /> },
    { id: 'matrix', label: 'What-If Simulation', icon: <SlidersHorizontal size={18} /> },
    { id: 'vault', label: 'College Vault & AI', icon: <BookOpenCheck size={18} /> },
    { id: 'compare', label: 'Compare Trade-Offs', icon: <ClipboardList size={18} /> },
    { id: 'timeline', label: 'Decision Timeline', icon: <Timer size={18} /> },
    { id: 'reflection', label: 'Confirm & Reflect', icon: <CheckCircle2 size={18} /> },
  ];

  function goToSection(sectionId) {
    setActiveSection(sectionId);
    if (sectionId === 'onboarding') {
      setEditProfile({ ...admissionProfile });
    }
  }

  async function toggleShortlist(id) {
    const college = activeCatalog.find((c) => c.id === id);
    if (!college) return;

    const isShortlisted = shortlistedIds.includes(id);

    try {
      setIsLoading(true);
      if (isShortlisted) {
        if (college.shortlistId) {
          await deleteShortlist(college.shortlistId);
        }
        setShortlistedIds((current) => {
          const next = current.filter((item) => item !== id);
          if (id === selectedId && next.length) setSelectedId(next[0]);
          return next;
        });
      } else {
        if (college.apiId) {
          const { shortlist } = await upsertShortlist(college.apiId, {
            confidence: college.confidence || 70,
            pros: college.pros || [],
            cons: college.cons || [],
            priorities: priorities,
            researchLinks: college.customLinks || [],
          });
          setCatalog((current) => current.map((c) => (c.id === id ? { ...c, shortlistId: shortlist._id } : c)));
        }
        setShortlistedIds((current) => [...current, id]);
      }
      await refreshActivities();
    } catch (err) {
      showToast('Failed to update shortlist: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  function updatePriority(key, weight) {
    setPriorities((current) =>
      current.map((priority) => (priority.key === key ? { ...priority, weight: Number(weight) } : priority))
    );
  }

  const applyPreset = (presetName) => {
    setPriorities((current) => {
      return current.map(p => {
        if (presetName === 'placement') {
          if (p.key === 'avgPackage' || p.key === 'roi') return { ...p, weight: 5 };
          if (p.key === 'fees') return { ...p, weight: 1 };
          if (p.key === 'campusLife') return { ...p, weight: 3 };
          if (p.key === 'research') return { ...p, weight: 2 };
          if (p.key === 'distanceKm') return { ...p, weight: 2 };
        } else if (presetName === 'budget') {
          if (p.key === 'fees' || p.key === 'roi') return { ...p, weight: 5 };
          if (p.key === 'avgPackage') return { ...p, weight: 2 };
          if (p.key === 'campusLife') return { ...p, weight: 2 };
          if (p.key === 'research') return { ...p, weight: 1 };
          if (p.key === 'distanceKm') return { ...p, weight: 3 };
        } else if (presetName === 'location') {
          if (p.key === 'distanceKm') return { ...p, weight: 5 };
          if (p.key === 'fees') return { ...p, weight: 3 };
          if (p.key === 'roi') return { ...p, weight: 3 };
          if (p.key === 'avgPackage') return { ...p, weight: 4 };
          if (p.key === 'campusLife') return { ...p, weight: 3 };
          if (p.key === 'research') return { ...p, weight: 2 };
        } else if (presetName === 'campus') {
          if (p.key === 'campusLife') return { ...p, weight: 5 };
          if (p.key === 'research') return { ...p, weight: 4 };
          if (p.key === 'avgPackage') return { ...p, weight: 4 };
          if (p.key === 'fees') return { ...p, weight: 2 };
          if (p.key === 'roi') return { ...p, weight: 3 };
          if (p.key === 'distanceKm') return { ...p, weight: 2 };
        }
        return p;
      });
    });
  };

  function updateAdmissionProfile(key, value) {
    setAdmissionProfile((current) => ({ ...current, [key]: value }));
  }

  async function runAdmissionMl(profile = admissionProfile) {
    const rank = getRankFromProfile(profile);

    if (!currentUser || !rank) {
      setAdmissionPredictions([]);
      setMlLastRunAt('');
      setMlError('Enter a valid rank in your profile to unlock automatic ML admission guidance.');
      return;
    }

    setPredictingAdmission(true);
    setMlError('');

    try {
      const seatType = mapCategoryToSeatType(profile.category);
      const res = await predictAdmission({
        rank,
        seatType,
        gender: jeeGender || 'Gender-Neutral',
        quota: jeeQuota || 'AI',
        limit: 500,
      });
      setAdmissionPredictions(res.predictions || []);
      setMlLastRunAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (res.message) setMlError(res.message);
    } catch (err) {
      setAdmissionPredictions([]);
      setMlError(err.message || 'ML admission guidance is unavailable right now.');
    } finally {
      setPredictingAdmission(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      runAdmissionMl(admissionProfile);
    }, 450);

    return () => clearTimeout(timer);
  }, [
    currentUser,
    admissionProfile.score,
    admissionProfile.scoreType,
    admissionProfile.category,
    jeeGender,
    jeeQuota,
  ]);

  useEffect(() => {
    const rank = getRankFromProfile(admissionProfile);
    if (rank) setJeeRank(String(rank));
    setJeeCategory(mapCategoryToSeatType(admissionProfile.category));
  }, [admissionProfile.score, admissionProfile.scoreType, admissionProfile.category]);

  if (appStage === 'landing') {
    return <LandingPage onLogin={() => setAppStage('login')} theme={theme} toggleTheme={toggleTheme} />;
  }

  if (appStage === 'login') {
    return (
      <LoginScreen
        onBack={() => setAppStage('landing')}
        onHome={() => setAppStage('landing')}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (appStage === 'journey') {
    return (
      <JourneyScreen
        onHome={() => setAppStage('landing')}
        onClass12={() => {
          setAdmissionProfile({
            journey: 'Class 12 planning',
            exam: 'Class 12',
            scoreType: 'Board %',
            score: '86',
            category: 'General',
            homeState: 'Uttar Pradesh',
            preferredBranches: 'Computer Science, Data Science, Electronics',
            stream: 'PCM',
            budget: 'Up to INR 8L total',
            targetExam: 'JEE Main',
            fileName: '',
            scorecardBase64: '',
          });
          setAppStage('class12-intake');
        }}
        onEntrance={() => {
          setAdmissionProfile((current) => ({
            ...current,
            journey: 'Entrance result ready',
            exam: current.exam === 'Class 12' ? 'JEE Main' : current.exam,
            scoreType: current.scoreType === 'Board %' ? 'Rank' : current.scoreType,
            score: current.scoreType === 'Board %' ? '8900' : current.score,
          }));
          setAppStage('intake');
        }}
      />
    );
  }

  if (appStage === 'class12-intake') {
    return (
      <Class12OnboardingScreen
        admissionProfile={admissionProfile}
        updateAdmissionProfile={updateAdmissionProfile}
        onHome={() => setAppStage('landing')}
        onBack={() => setAppStage('journey')}
        onContinue={handleOnboardingComplete}
      />
    );
  }

  if (appStage === 'intake') {
    return (
      <OnboardingScreen
        admissionProfile={admissionProfile}
        updateAdmissionProfile={updateAdmissionProfile}
        onHome={() => setAppStage('landing')}
        onBack={() => setAppStage('journey')}
        onContinue={handleOnboardingComplete}
        onFileUpload={handleFileUpload}
      />
    );
  }

  const handleAdmissionPredict = async (e) => {
    e?.preventDefault?.();
    if (!jeeRank) {
      showToast('Please enter a rank.', 'error');
      return;
    }
    setPredictingAdmission(true);
    try {
      const res = await predictAdmission({
        rank: jeeRank,
        seatType: jeeCategory,
        gender: jeeGender,
        quota: jeeQuota,
        limit: 500,
      });
      const predictions = res.predictions || [];
      setAdmissionPredictions(predictions);
      setMlLastRunAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setMlError(res.message || '');
      showToast(res.message || `Found ${predictions.length} matching programs!`, predictions.length ? 'success' : 'error');
    } catch (err) {
      showToast(err.message || 'Admission prediction failed.', 'error');
    } finally {
      setPredictingAdmission(false);
    }
  };

  const handlePlacementPredict = async (e) => {
    e.preventDefault();
    setPredictingPlacement(true);
    try {
      const res = await predictPlacement({
        gender: studentGender,
        age: studentAge,
        degree: studentDegree,
        branch: studentBranch,
        cgpa: studentCgpa,
        backlogs: studentBacklogs,
        internships: studentInternships,
        certifications: studentCertifications,
        codingSkills: studentCodingSkills,
        communicationSkills: studentCommunicationSkills,
        aptitudeScore: studentAptitudeScore,
        projects: studentProjects
      });
      setPlacementPrediction(res);
      showToast('Placement predictions loaded!', 'success');
    } catch (err) {
      showToast(err.message || 'Placement prediction failed.', 'error');
    } finally {
      setPredictingPlacement(false);
    }
  };

  const renderOnboardingPanel = () => (
    <section className="panel" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Onboarding & Profile</p>
          <h3>Manage Your Admissions Profile</h3>
        </div>
      </div>
      <div style={{ padding: '24px' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Keep your rank, categories, state of eligibility, and branch preferences updated. The fit scoring engine updates immediately.
        </p>
        <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px', maxWidth: '800px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Target Exam
            <input value={editProfile.exam || ''} onChange={e => setEditProfile(p => ({ ...p, exam: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Score Type
            <select value={editProfile.scoreType || 'Rank'} onChange={e => setEditProfile(p => ({ ...p, scoreType: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
              <option>Rank</option>
              <option>Percentile</option>
              <option>Board %</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Your Score / Rank
            <input value={editProfile.score || ''} onChange={e => setEditProfile(p => ({ ...p, score: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Category (Reservation)
            <select value={editProfile.category || 'General'} onChange={e => setEditProfile(p => ({ ...p, category: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
              <option>General</option>
              <option>OBC-NCL</option>
              <option>EWS</option>
              <option>SC</option>
              <option>ST</option>
              <option>PwD</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Home State (Eligibility)
            <input value={editProfile.homeState || ''} onChange={e => setEditProfile(p => ({ ...p, homeState: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            Preferred Branches (Comma separated)
            <input value={editProfile.preferredBranches || ''} onChange={e => setEditProfile(p => ({ ...p, preferredBranches: e.target.value }))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
          </label>

          <div style={{ gridColumn: '1 / -1', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '16px', background: 'var(--bg-app)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <strong>Upload Scorecard (Optional OCR Autofill)</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Images (.png, .jpg) are parsed automatically.</span>
              <input type="file" accept="image/*" onChange={handleEditFileUpload} style={{ fontSize: '0.85rem' }} />
              {editProfile.fileName && <small style={{ color: '#27ae60', marginTop: '6px', fontWeight: 'bold' }}>Attached scorecard: {editProfile.fileName}</small>}
            </label>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '10px' }}>
            <button type="submit" className="primaryAction" style={{ margin: 0, width: 'auto', padding: '0 24px' }}>Save Profile Changes</button>
          </div>
        </form>
      </div>
    </section>
  );

  const renderSearchPanel = () => (
    <section className="panel" id="search" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Search layer</p>
          <h3>{isDatasetDiscovery ? 'Cutoff dataset discovery' : 'College discovery'}</h3>
        </div>
        <span className="quietBadge">{filteredColleges.length} results</span>
      </div>

      <div className="notesBlock" style={{ margin: '18px', padding: '14px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <strong>{isDatasetDiscovery ? 'Using uploaded cutoff dataset' : 'Showing fallback seed colleges'}</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              {isDatasetDiscovery
                ? `${admissionPredictions.length} dataset programs loaded for rank ${admissionProfile.score || jeeRank}.`
                : 'Save a valid rank in Onboarding to load dataset-backed college/program results automatically.'}
            </p>
          </div>
          {mlLastRunAt && <span className="quietBadge">Updated {mlLastRunAt}</span>}
        </div>

        {mlError && <small style={{ color: '#c0392b', fontWeight: 700 }}>{mlError}</small>}
      </div>

      <div className="filterBar">
        <label className="searchBox">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search college, branch, state, or tag"
          />
        </label>

        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
          {states.map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>

        <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          {branches.map((branch) => (
            <option key={branch}>{branch}</option>
          ))}
        </select>
      </div>

      <div className="collegeList">
        {filteredColleges.map((college) => (
          <article
            className={`collegeRow ${selectedCollege.id === college.id ? 'selected' : ''}`}
            key={college.id}
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}
          >
            <button className="collegeMain" onClick={() => setSelectedId(college.id)} style={{ gridColumn: '1 / 2', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', padding: '0', cursor: 'pointer' }}>
              <span className="rankBadge">{college.score}</span>
              <span>
                <strong>{college.name}</strong>
                <small style={{ color: 'var(--text-secondary)' }}>
                  {college.branch} / {college.city}, {college.state}
                </small>
              </span>
            </button>

            <div className="collegeSignals" style={{ alignSelf: 'center', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`eligibilityBadge ${college.eligibility?.status.toLowerCase().replace(' ', '-')}`} title={college.eligibility?.reason}>
                {college.eligibility?.status}
              </span>
              {college.mlAdmission && (
                <span className={`eligibilityBadge ${college.mlAdmissionStatus.className}`} title={`${college.mlAdmission.program} / closing rank ${college.mlAdmission.closingRank}`}>
                  ML {college.mlAdmission.probability}%
                </span>
              )}
              {college.isDatasetResult ? (
                <span className="feeBadge" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                  Closing {college.mlAdmission?.closingRank}
                </span>
              ) : (
                <>
                  <span className="packageBadge" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>{formatPackage(college.avgPackage)}</span>
                  <span className="feeBadge" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{formatFee(college.fees)}</span>
                </>
              )}
            </div>

            <button
              className={`iconAction ${shortlistedIds.includes(college.id) ? 'on' : ''}`}
              onClick={() => toggleShortlist(college.id)}
              aria-label={`${shortlistedIds.includes(college.id) ? 'Remove' : 'Add'} ${college.name}`}
              style={{ gridRow: '1 / 2', gridColumn: '2 / 3', alignSelf: 'center' }}
            >
              <Check size={17} />
            </button>

            {selectedCollege.id === college.id && (
              <div className="scoreExplainability" style={{ gridColumn: '1 / -1', marginTop: '10px', background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', fontSize: '0.78rem', borderLeft: '4px solid #526b35', textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Fit Score Contribution Breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {priorities.map((priority) => {
                    const normalized = normalizeMetric(college, priority.key, activeCatalog);
                    const totalWeight = priorities.reduce((sum, p) => sum + p.weight, 0);
                    const contribution = Math.round((normalized * priority.weight / totalWeight) * 100);
                    return (
                      <div key={priority.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{priority.label}:</span>
                        <div style={{ flex: '1', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                          <div style={{ width: '60px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(4, normalized * 100)}%`, background: '#526b35', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', minWidth: '32px', textAlign: 'right' }}>+{contribution}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                  * Contribution represents how well this university matches your priority weights.
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );

  const renderComparePanel = () => (
    <section className="panel" id="compare" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Shortlist</p>
          <h3>Comparison table</h3>
        </div>
        <span className="quietBadge">Live scoring</span>
      </div>

      {shortlisted.length === 0 ? (
        <div style={{ padding: '24px', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>
          No colleges shortlisted for comparison. Add colleges to your shortlist from the Discovery tab.
        </div>
      ) : (
        <>
          {isDatasetDiscovery ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Institute</th>
                    <th>Program</th>
                    <th>Quota</th>
                    <th>Seat Type</th>
                    <th>Opening Rank</th>
                    <th>Closing Rank</th>
                    <th>Admission Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlisted.map((college) => (
                    <tr key={college.id}>
                      <td>
                        <strong>{college.name}</strong>
                        <small style={{ display: 'block', color: 'var(--text-secondary)' }}>{college.mlAdmission?.gender}</small>
                      </td>
                      <td>{college.branch}</td>
                      <td>{college.mlAdmission?.quota}</td>
                      <td>{college.mlAdmission?.seatType}</td>
                      <td>{college.mlAdmission?.openingRank}</td>
                      <td>{college.mlAdmission?.closingRank}</td>
                      <td>
                        <span className={`eligibilityBadge ${college.mlAdmissionStatus.className}`}>
                          {college.mlAdmission?.probability}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {shortlisted.map((college) => (
                      <th key={college.id}>{college.shortName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Fit Score" values={shortlisted.map((college) => `${college.score}%`)} />
                  <CompareRow
                    label="Eligibility"
                    values={shortlisted.map((college) => (
                      <span className={`eligibilityBadge ${college.eligibility?.status.toLowerCase().replace(' ', '-')}`}>
                        {college.eligibility?.status}
                      </span>
                    ))}
                  />
                  <CompareRow label="Fees" values={shortlisted.map((college) => formatFee(college.fees))} />
                  <CompareRow label="Avg Package" values={shortlisted.map((college) => formatPackage(college.avgPackage))} />
                  <CompareRow label="Placement" values={shortlisted.map((college) => `${college.placementRate}%`)} />
                  <CompareRow label="Hostel" values={shortlisted.map((college) => (college.hostel ? 'Yes' : 'No'))} />
                  <CompareRow label="Distance" values={shortlisted.map((college) => `${college.distanceKm} km`)} />
                  <CompareRow label="Campus Life" values={shortlisted.map((college) => college.campusLife.toFixed(1))} />
                  <CompareRow label="Research" values={shortlisted.map((college) => college.research.toFixed(1))} />
                </tbody>
              </table>
            </div>
          )}

          {shortlisted.length >= 2 && (() => {
            const c1 = shortlisted[0];
            const c2 = shortlisted[1];
            if (isDatasetDiscovery) {
              return (
                <div className="tradeOffCard" style={{ margin: '15px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '15px', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    <SlidersHorizontal size={16} />
                    Dataset Cutoff Comparison
                  </div>
                  <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                    Comparing the top dataset matches returned for rank {admissionProfile.score}:
                  </p>
                  <ul style={{ margin: '0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>{c1.shortName}</strong>: {c1.branch}, closing rank {c1.mlAdmission?.closingRank}, probability {c1.mlAdmission?.probability}%.</li>
                    <li><strong>{c2.shortName}</strong>: {c2.branch}, closing rank {c2.mlAdmission?.closingRank}, probability {c2.mlAdmission?.probability}%.</li>
                    <li>Fees, placements, hostel, and campus quality are not in the cutoff dataset and should be verified with official sources before final decision.</li>
                  </ul>
                </div>
              );
            }

            const diffPackage = c1.avgPackage - c2.avgPackage;
            const diffFees = c1.fees - c2.fees;
            const diffDistance = c1.distanceKm - c2.distanceKm;
            const diffCampus = c1.campusLife - c2.campusLife;
            return (
              <div className="tradeOffCard" style={{ margin: '15px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '15px', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  <SlidersHorizontal size={16} />
                  Smart Trade-Off Analysis (Top 2 Choices)
                </div>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  Comparing your top match <strong>{c1.name}</strong> against your second option <strong>{c2.name}</strong>:
                </p>
                <ul style={{ margin: '0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>
                    <strong>Fit Margin</strong>: <strong>{c1.shortName}</strong> is rated <strong>+{c1.score - c2.score}%</strong> higher in total priority alignment.
                  </li>
                  <li>
                    <strong>Placement & Earnings</strong>: {diffPackage > 0 ? <span>Gains an estimated average salary increase of <strong style={{ color: '#27ae60' }}>+{diffPackage.toFixed(1)} LPA</strong>.</span> : <span>Sacrifices an estimated <strong style={{ color: '#c0392b' }}>{Math.abs(diffPackage).toFixed(1)} LPA</strong> in average salary.</span>}
                  </li>
                  <li>
                    <strong>Academic Cost</strong>: {diffFees > 0 ? <span>Increases total expense by <strong style={{ color: '#c0392b' }}>{formatFee(diffFees)}</strong>.</span> : <span>Saves you <strong style={{ color: '#27ae60' }}>{formatFee(Math.abs(diffFees))}</strong> in total fees.</span>}
                  </li>
                  <li>
                    <strong>Location Fit</strong>: {diffDistance > 0 ? <span>Places you <strong style={{ color: '#c0392b' }}>{diffDistance} km</strong> further from home.</span> : <span>Places you <strong style={{ color: '#27ae60' }}>{Math.abs(diffDistance)} km</strong> closer to home.</span>}
                  </li>
                  <li>
                    <strong>Campus Experience</strong>: {diffCampus > 0 ? <span>Features a higher campus satisfaction rating (<strong style={{ color: '#27ae60' }}>+{diffCampus.toFixed(1)}/10</strong>).</span> : <span>Features a slightly lower campus satisfaction rating (<strong style={{ color: '#c0392b' }}>-{Math.abs(diffCampus).toFixed(1)}/10</strong>).</span>}
                  </li>
                </ul>
              </div>
            );
          })()}
        </>
      )}
    </section>
  );

  const renderMatrixPanel = () => (
    <section className="panel" id="matrix" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Priority engine</p>
          <h3>Decision matrix</h3>
        </div>
        <span className="quietBadge">Weights 1-5</span>
      </div>

      <div className="notesBlock" style={{ margin: '18px', padding: '12px', fontSize: '0.82rem' }}>
        <strong>Rank model context:</strong>{' '}
        {bestMlCollege
          ? `${bestMlCollege.shortName} currently has the strongest seeded cutoff signal at ${bestMlCollege.mlAdmission.probability}%.`
          : 'Save a valid rank profile to add automatic cutoff guidance to this matrix.'}
      </div>

      <div className="whatIfSimulator" style={{ padding: '0 18px 15px', borderBottom: '1px dashed var(--border-color)', marginBottom: '15px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>What-If Simulation Presets</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button type="button" onClick={() => applyPreset('placement')} className="textButton" style={{ fontSize: '0.75rem', padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
            💼 Placements First
          </button>
          <button type="button" onClick={() => applyPreset('budget')} className="textButton" style={{ fontSize: '0.75rem', padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
            🪙 Budget & ROI
          </button>
          <button type="button" onClick={() => applyPreset('location')} className="textButton" style={{ fontSize: '0.75rem', padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
            📍 Near Home
          </button>
          <button type="button" onClick={() => applyPreset('campus')} className="textButton" style={{ fontSize: '0.75rem', padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
            🏫 Campus Life
          </button>
        </div>
      </div>

      <div className="priorityList" style={{ padding: '18px' }}>
        {priorities.map((priority) => (
          <label className="priorityItem" key={priority.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{priority.label}</strong>
              <small style={{ color: 'var(--text-secondary)' }}>{priority.weight}/5 priority</small>
            </span>
            <input
              type="range"
              min="1"
              max="5"
              value={priority.weight}
              onChange={(event) => updatePriority(priority.key, event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        ))}
      </div>
    </section>
  );

  const renderVaultPanel = () => (
    <section className="panel selectedVault" id="vault" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Research vault</p>
          <h3>College Vault & AI Insights</h3>
        </div>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '6px' }}>
          {activeCatalog.map((c) => (
            <option value={c.id} key={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="notesBlock" style={{ padding: '14px', margin: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <strong>ML admission signal</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {selectedCollege.mlAdmission
              ? `${selectedCollege.mlAdmission.program} closes near rank ${selectedCollege.mlAdmission.closingRank}.`
              : 'No seeded cutoff match was found for this college yet.'}
          </p>
        </div>
        <span className={`eligibilityBadge ${selectedCollege.mlAdmissionStatus?.className || 'ambiguous'}`}>
          {selectedCollege.mlAdmission ? `${selectedCollege.mlAdmission.probability}%` : 'No match'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="twoCol" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="decisionList">
              <h4>Pros</h4>
              {selectedCollege.pros.map((pro) => (
                <p className="positive" key={pro} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{pro}</span>
                  {selectedCollege.shortlistId && (
                    <button type="button" onClick={() => handleDeletePro(pro)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 0 }} title="Remove pro">
                      <X size={13} />
                    </button>
                  )}
                </p>
              ))}
              {selectedCollege.shortlistId && (
                <form onSubmit={handleAddPro} className="inlineAddForm">
                  <input value={newPro} onChange={e => setNewPro(e.target.value)} placeholder="Add pro..." required />
                  <button type="submit">+</button>
                </form>
              )}
            </div>
            <div className="decisionList">
              <h4>Cons</h4>
              {selectedCollege.cons.map((con) => (
                <p key={con} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{con}</span>
                  {selectedCollege.shortlistId && (
                    <button type="button" onClick={() => handleDeleteCon(con)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: 0 }} title="Remove con">
                      <X size={13} />
                    </button>
                  )}
                </p>
              ))}
              {selectedCollege.shortlistId && (
                <form onSubmit={handleAddCon} className="inlineAddForm">
                  <input value={newCon} onChange={e => setNewCon(e.target.value)} placeholder="Add con..." required />
                  <button type="submit">+</button>
                </form>
              )}
            </div>
          </div>

          <div className="notesBlock">
            <h4>Personal notes</h4>
            {selectedCollege.rawNotes?.map((note) => (
              <p key={note._id} className="noteItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{note.body}</span>
                <button type="button" className="iconAction" onClick={() => handleDeleteNote(note._id)} title="Delete note" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  <Trash2 size={14} />
                </button>
              </p>
            ))}
            {selectedCollege.shortlistId && (
              <form onSubmit={handleAddNote} className="noteAddForm">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add new research note..."
                  required
                  rows={2}
                />
                <button type="submit" className="textButton">Save Note</button>
              </form>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedCollege.shortlistId ? (
            <div className="aiSummarizer" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#526b35', margin: '0 0 10px 0' }}>
                <Sparkles size={16} /> Google Gemini AI Research Summarizer
              </h4>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Paste YouTube transcripts, senior comments, or placement reports. Gemini AI extracts pros, cons, and reliability rating.
              </p>
              <form onSubmit={handleAiSummarize} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder="Paste research text here..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  required
                />
                <button type="submit" className="primaryAction" style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'fit-content' }} disabled={aiLoading}>
                  {aiLoading ? 'Gemini is summarizing...' : 'Summarize with Gemini AI'}
                </button>
              </form>

              {aiResult && (
                <div style={{ marginTop: '12px', background: 'rgba(39, 174, 96, 0.1)', border: '1px solid #27ae60', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ color: '#27ae60' }}>Pros:</strong>
                      <ul style={{ paddingLeft: '15px', margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                        {aiResult.pros.map((p, idx) => <li key={idx}>{p}</li>)}
                      </ul>
                    </div>
                    <div>
                      <strong style={{ color: '#c0392b' }}>Cons:</strong>
                      <ul style={{ paddingLeft: '15px', margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                        {aiResult.cons.map((c, idx) => <li key={idx}>{c}</li>)}
                      </ul>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border-color)', paddingTop: '8px', fontSize: '0.78rem' }}>
                    <span>Reliability Score: <strong>{aiResult.confidence}%</strong></span>
                    <button type="button" onClick={handleImportAiInsights} className="textButton" style={{ padding: '4px 8px', textDecoration: 'underline', fontWeight: 'bold' }}>
                      Import into Vault
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Gemini AI Q&A Counselor */}
          <div className="aiCounselor" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#526b35', margin: '0 0 10px 0' }}>
              <GraduationCap size={16} /> Google Gemini Admissions Counselor Q&A
            </h4>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Ask specific questions such as "Will I get CSE at this rank?" or "How is hostel mess here?".
            </p>
            <form onSubmit={handleAskGemini} style={{ display: 'flex', gap: '8px' }}>
              <input
                value={geminiQuestion}
                onChange={(e) => setGeminiQuestion(e.target.value)}
                placeholder="Type your Q&A question here..."
                style={{ flex: 1, padding: '8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                required
              />
              <button type="submit" className="primaryAction" style={{ padding: '8px 12px', fontSize: '0.8rem' }} disabled={geminiQaLoading}>
                {geminiQaLoading ? 'Asking...' : 'Ask'}
              </button>
            </form>
            {geminiAnswer && (
              <div className="notesBlock" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-card)', borderLeft: '3px solid #1a56db', fontSize: '0.82rem', whiteSpace: 'pre-line' }}>
                {geminiAnswer}
              </div>
            )}
          </div>

          <div className="researchLinks">
            <h4>Evidence links</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedCollege.researchLinks.map((link, index) => (
                <a href={link.url} target="_blank" rel="noreferrer" key={`${link.label}-${index}`} style={{ display: 'flex', gap: '6px', alignItems: 'center', textDecoration: 'none', color: '#1a56db', fontSize: '0.82rem' }}>
                  <Link2 size={15} />
                  <span>{link.label}</span>
                  <small style={{ color: 'var(--text-secondary)' }}>({link.type})</small>
                </a>
              ))}
            </div>
            {selectedCollege.shortlistId && (
              <form onSubmit={handleAddLink} className="linkAddForm" style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Link label (e.g. PDF)" required style={{ padding: '6px', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="URL" required type="url" style={{ padding: '6px', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                <select value={linkType} onChange={e => setLinkType(e.target.value)} style={{ padding: '6px', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                  <option>Official</option>
                  <option>Placement PDF</option>
                  <option>YouTube</option>
                  <option>Reddit</option>
                  <option>Senior Note</option>
                  <option>Article</option>
                  <option>Other</option>
                </select>
                <button type="submit" style={{ padding: '6px 12px', background: '#526b35', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Add Link</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const renderReflectionPanel = () => (
    <section className="panel" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Final decision</p>
          <h3>Lock Seat & 6-Month Reflection</h3>
        </div>
        <select value={decisionId} onChange={(event) => setDecisionId(event.target.value)} disabled={hasConfirmedDecision} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
          {shortlisted.map((college) => (
            <option value={college.id} key={college.id}>
              {college.shortName}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px' }}>
        <div className="decisionSummary" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          <span className="decisionLogo" style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#526b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
            {finalCollege.shortName.slice(0, 2)}
          </span>
          <div>
            <strong style={{ fontSize: '1.1rem', display: 'block' }}>{finalCollege.name}</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Best balance of ROI, placement signal, coding culture, and practical fit.</p>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          {hasConfirmedDecision ? (
            <span style={{ color: '#1e7e34', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} /> Decision Confirmed & Locked to MongoDB
            </span>
          ) : (
            <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '8px' }}>
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                Ready to lock this choice? Confirming will save it to the database.
              </small>
              <button type="button" onClick={handleConfirmDecision} className="primaryAction" style={{ width: 'auto', padding: '10px 20px' }}>
                Confirm College Decision
              </button>
            </div>
          )}
        </div>

        <div className="reflectionBox" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
          <h4 style={{ marginBottom: '8px' }}>Post-Admission Reflection Loop</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Record retrospective feedback after 6 months on campus to validate the decision matrix accuracy.</p>

          {!hasConfirmedDecision ? (
            <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              Please confirm your college decision first to unlock the reflection form.
            </p>
          ) : hasReflected ? (
            <div style={{ background: 'rgba(39, 174, 96, 0.1)', padding: '16px', borderRadius: '8px', color: '#27ae60' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>✅ Reflection Logged successfully!</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                <p>Satisfaction: <strong>{satisfaction}/10</strong></p>
                <p>Placements accurate: <strong>{placementAccurate ? 'Yes' : 'No'}</strong></p>
                <p>Would choose again: <strong>{chooseAgain ? 'Yes' : 'No'}</strong></p>
                {surprise && <p>Surprise: {surprise}</p>}
                {regret && <p>Regret: {regret}</p>}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveReflection} className="reflectionForm" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                Retrospective Satisfaction (1-10)
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={satisfaction}
                    onChange={(e) => setSatisfaction(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span>{satisfaction}</span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={placementAccurate}
                  onChange={(e) => setPlacementAccurate(e.target.checked)}
                />
                Placement and packages data was accurate
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={chooseAgain}
                  onChange={(e) => setChooseAgain(e.target.checked)}
                />
                Would choose this college again
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                Biggest Surprise
                <input
                  type="text"
                  value={surprise}
                  onChange={(e) => setSurprise(e.target.value)}
                  placeholder="e.g. Coding culture was even better..."
                  style={{ padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                Biggest Regret / Caveat
                <input
                  type="text"
                  value={regret}
                  onChange={(e) => setRegret(e.target.value)}
                  placeholder="e.g. Hostel rooms are small..."
                  style={{ padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                />
              </label>

              <button type="submit" className="primaryAction" style={{ width: 'fit-content', padding: '10px 20px', marginTop: '10px' }}>Submit 6-Month Reflection</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );

  const renderTimelinePanel = () => (
    <article className="panel decisionTimeline" style={{ width: '100%', textAlign: 'left', animation: 'fadeIn 0.2s ease' }}>
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Milestones & Audit Trail</p>
          <h3>Decision Journey Timeline</h3>
        </div>
        <span className="quietBadge">{activities.length} entries recorded</span>
      </div>

      <div className="timelineContainer" style={{ padding: '10px 15px', position: 'relative', overflowY: 'auto', maxHeight: '400px' }}>
        {activities.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '15px 0' }}>
            No research actions recorded yet. Shortlist a college or save a note to populate the timeline.
          </div>
        ) : (
          <div className="timelineLine" style={{ position: 'relative', borderLeft: '2px solid var(--border-color)', marginLeft: '10px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {activities.map((act) => {
              let badgeColor = '#526b35';
              let badgeLabel = 'Action';
              if (act.action === 'shortlist_add') { badgeColor = '#1a56db'; badgeLabel = 'Shortlist'; }
              else if (act.action === 'shortlist_remove') { badgeColor = '#e11d48'; badgeLabel = 'Removed'; }
              else if (act.action === 'note_add') { badgeColor = '#d97706'; badgeLabel = 'Note'; }
              else if (act.action === 'note_delete') { badgeColor = '#9ca3af'; badgeLabel = 'Note Del'; }
              else if (act.action === 'link_add') { badgeColor = '#7c3aed'; badgeLabel = 'Evidence'; }
              else if (act.action === 'decision_confirm') { badgeColor = '#16a34a'; badgeLabel = 'Lock Seat'; }
              else if (act.action === 'reflection_add') { badgeColor = '#0891b2'; badgeLabel = 'Reflection'; }

              return (
                <div className="timelineItem" key={act._id || act.createdAt} style={{ position: 'relative', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: badgeColor, border: '2px solid var(--bg-card)' }} />
                  <div style={{ background: 'var(--bg-app)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', flex: '1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ background: `${badgeColor}15`, color: badgeColor, padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{badgeLabel}</span>
                      <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{new Date(act.createdAt).toLocaleString()}</small>
                    </div>
                    <p style={{ margin: '0', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{act.details}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );

  const renderPredictorPanel = () => (
    <div className="predictorGrid" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
      {/* Col 1: Admission Predictor */}
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">JEE Cutoff Analytics</p>
            <h3>Admission Probability Matcher</h3>
          </div>
        </div>
        <form onSubmit={handleAdmissionPredict} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>JEE Rank (CRL/Category)</label>
              <input 
                type="number" 
                value={jeeRank} 
                onChange={(e) => setJeeRank(e.target.value)} 
                placeholder="Enter rank e.g. 8500" 
                style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                required 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seat Category</label>
              <select value={jeeCategory} onChange={(e) => setJeeCategory(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="OPEN">OPEN (General)</option>
                <option value="OBC-NCL">OBC-NCL</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
                <option value="EWS">EWS</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gender Constraint</label>
              <select value={jeeGender} onChange={(e) => setJeeGender(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="Gender-Neutral">Gender-Neutral</option>
                <option value="Female-only (including Supernumerary)">Female-only</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Quota</label>
              <select value={jeeQuota} onChange={(e) => setJeeQuota(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="AI">AI (All India)</option>
                <option value="HS">HS (Home State)</option>
                <option value="OS">OS (Other State)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="primaryAction" style={{ width: '100%', padding: '10px', marginTop: '6px' }} disabled={predictingAdmission}>
            {predictingAdmission ? 'Running DB Query...' : 'Calculate Admission Likelihood'}
          </button>
        </form>

        {admissionPredictions.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h4>Top Cutoff Matches</h4>
            <div style={{ maxHeight: '350px', overflowY: 'auto', marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Institute & Program</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Closing Rank</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {admissionPredictions.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px' }}>
                        <strong>{row.institute}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.program} ({row.quota})</div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {row.closingRank}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span className={`eligibilityBadge ${
                          row.probability > 75 ? 'eligible' : row.probability > 40 ? 'ambiguous' : 'ineligible'
                        }`}>
                          {row.probability}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Col 2: Placement & Package Predictor */}
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Machine Learning Solver</p>
            <h3>Placement & Salary Forecaster</h3>
          </div>
        </div>
        <form onSubmit={handlePlacementPredict} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gender</label>
              <select value={studentGender} onChange={(e) => setStudentGender(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Age</label>
              <input type="number" value={studentAge} onChange={(e) => setStudentAge(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="18" max="30" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Degree</label>
              <select value={studentDegree} onChange={(e) => setStudentDegree(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="BTech">B.Tech</option>
                <option value="BE">B.E.</option>
                <option value="BSc">B.Sc</option>
                <option value="BCA">B.C.A</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Branch</label>
              <select value={studentBranch} onChange={(e) => setStudentBranch(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <option value="CS">Computer Science</option>
                <option value="IT">Information Tech</option>
                <option value="AI">Artificial Intell</option>
                <option value="DS">Data Science</option>
                <option value="Electrical">Electrical</option>
                <option value="Mechanical">Mechanical</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CGPA</label>
              <input type="number" step="0.01" value={studentCgpa} onChange={(e) => setStudentCgpa(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="1" max="10" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Backlogs</label>
              <input type="number" value={studentBacklogs} onChange={(e) => setStudentBacklogs(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="0" required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Internships</label>
              <input type="number" value={studentInternships} onChange={(e) => setStudentInternships(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="0" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Certificates</label>
              <input type="number" value={studentCertifications} onChange={(e) => setStudentCertifications(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="0" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Projects</label>
              <input type="number" value={studentProjects} onChange={(e) => setStudentProjects(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="0" required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Coding (1-10)</label>
              <input type="number" value={studentCodingSkills} onChange={(e) => setStudentCodingSkills(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="1" max="10" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Comm (1-10)</label>
              <input type="number" value={studentCommunicationSkills} onChange={(e) => setStudentCommunicationSkills(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="1" max="10" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aptitude (1-100)</label>
              <input type="number" value={studentAptitudeScore} onChange={(e) => setStudentAptitudeScore(e.target.value)} style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }} min="1" max="100" required />
            </div>
          </div>
          <button type="submit" className="primaryAction" style={{ width: '100%', padding: '10px', marginTop: '6px' }} disabled={predictingPlacement}>
            {predictingPlacement ? 'Calculating Regression...' : 'Run Career Predictor'}
          </button>
        </form>

        {placementPrediction && (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4>Trained ML Outputs</h4>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="metric" style={{ flex: 1, textAlign: 'center', padding: '16px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Placement Probability</span>
                <strong style={{ fontSize: '1.8rem', color: placementPrediction.placedProbability >= 0.5 ? '#27ae60' : '#c0392b' }}>
                  {Math.round(placementPrediction.placedProbability * 100)}%
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                  {placementPrediction.placedProbability >= 0.5 ? 'Likely Placed' : 'High risk'}
                </span>
              </div>
              <div className="metric" style={{ flex: 1, textAlign: 'center', padding: '16px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Expected Package</span>
                <strong style={{ fontSize: '1.8rem', color: '#1a56db' }}>
                  {placementPrediction.expectedPackageLpa} LPA
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                  Model trained successfully
                </span>
              </div>
            </div>

            <div className="notesBlock" style={{ padding: '12px' }}>
              <strong>ML Diagnostic Feedback:</strong>
              <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', marginTop: '6px', color: 'var(--text-primary)' }}>
                {studentBacklogs > 0 && <li style={{ color: '#c0392b' }}>Backlogs negatively affect placement odds. Resolve backlogs to increase likelihood by ~15% per backlog.</li>}
                {studentCgpa < 7.5 && <li>Your CGPA is slightly low. Reaching a CGPA of 8.0+ increases expected package by approximately 1.5 LPA.</li>}
                {studentCodingSkills < 7 && <li>Upgrading coding skill rating to 8+ triggers a probability increase for Startup and Product companies.</li>}
                {studentInternships === 0 && <li>Adding just 1 internship raises placement probability by ~10% based on historical coefficients.</li>}
                {studentBacklogs === 0 && studentCgpa >= 8 && studentCodingSkills >= 7 && <li style={{ color: '#27ae60' }}>Your profile displays strong alignment with high-paying tier-1 product offers!</li>}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      {isLoading && <div className="loadingOverlay">Processing...</div>}

      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '340px' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'error' ? '#dc2626' : '#16a34a',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.875rem',
            animation: 'fadeInRight 0.3s ease',
          }}>
            <span>{t.message}</span>
            <button onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        ))}
      </div>

      <main className="appShell">
        <aside className="sidebar">
          <button className="brandBlock brandButton" type="button" onClick={handleLogout}>
            <div className="brandMark">
              <GraduationCap size={21} />
            </div>
            <div>
              <p className="eyebrow">DecisionVault</p>
              <h1>CollegeVault</h1>
            </div>
          </button>

          <nav className="navStack" aria-label="Primary">
            {navItems.map((item) => (
              <button
                className={`navItem ${activeSection === item.id ? 'active' : ''}`}
                key={item.id}
                onClick={() => goToSection(item.id)}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sidebarPanel">
            <span className="panelLabel">Workspace goal</span>
            <p>Make a college decision with recorded evidence, weighted priorities, and a review loop.</p>
            <button className="primaryAction" type="button" onClick={() => goToSection('onboarding')} style={{ width: '100%', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Pencil size={14} /> Edit Profile
            </button>
            <button className="logoutButton" type="button" onClick={handleLogout}>Logout</button>
            <button className="dangerButton" type="button" onClick={handleDeleteAccount} style={{ marginTop: '8px' }}>Delete Account</button>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">College Decision Management System</p>
              <h2>Choose with data, remember the reasoning.</h2>
            </div>
            <div className="topbarRight">
              <div className="topbarStats" aria-label="Decision status">
                <span>{admissionProfile.journey}</span>
                <span>{admissionProfile.exam}</span>
                <span>
                  {admissionProfile.scoreType}: {admissionProfile.score}
                </span>
                <span>{shortlisted.length} shortlisted</span>
                <span>{finalCollege.score}% fit score</span>
                <span>Review due in 6 months</span>
              </div>
              <button 
                type="button" 
                className="themeToggle" 
                onClick={toggleTheme} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', color: 'var(--text-primary)' }}
                aria-label="Toggle dark mode"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className="logoutButton light" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </header>

          {activeSection === 'dashboard' && (
            <>
              <section className="analyticsStrip" id="analytics" style={{ animation: 'fadeIn 0.3s ease' }}>
                <Metric icon={<Timer size={18} />} label="ML Status" value={predictingAdmission ? 'Running' : (mlLastRunAt ? 'Ready' : 'Needs Rank')} />
                <Metric icon={<Building2 size={18} />} label="Compared" value={String(shortlisted.length)} />
                <Metric icon={<Target size={18} />} label="ML Matches" value={String(mlMatchedShortlistCount)} />
                <Metric icon={<Star size={18} />} label="Best ML Signal" value={bestMlCollege ? `${bestMlCollege.shortName} ${bestMlCollege.mlAdmission.probability}%` : 'Pending'} />
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%', animation: 'fadeIn 0.3s ease', marginBottom: '20px' }}>
                <article className="panel decisionTrail">
                  <div className="panelHeader">
                    <div>
                      <p className="eyebrow">Decision record</p>
                      <h3>Why this shortlist exists</h3>
                    </div>
                  </div>
                  <div className="trailList">
                    <span>
                      <strong>Profile basis:</strong> {admissionProfile.journey} / {admissionProfile.exam} / {admissionProfile.scoreType} {admissionProfile.score} / {admissionProfile.category}
                    </span>
                    <span>
                      <strong>Branch focus:</strong> {admissionProfile.preferredBranches}
                    </span>
                    <span>
                      <strong>Current leader:</strong> {finalCollege.name} because it scores highest ({finalCollege.score}%) against family priorities.
                    </span>
                  </div>
                </article>

                <article className="panel reviewQueue">
                  <div className="panelHeader">
                    <div>
                      <p className="eyebrow">Next actions</p>
                      <h3>Research still pending</h3>
                    </div>
                  </div>
                  <div className="queueGrid">
                    <span>Verify branch-wise placement reports for {finalCollege.shortName}</span>
                    <span>Ask one senior about hostel, mess, and coding culture</span>
                    <span>Compare total four-year cost with family budget</span>
                    <span>Record final reason before accepting the seat</span>
                  </div>
                </article>
              </div>

              <article className="panel" style={{ width: '100%', animation: 'fadeIn 0.3s ease', marginBottom: '20px' }}>
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">Automatic ML guidance</p>
                    <h3>Admission signal from your saved rank</h3>
                  </div>
                  <span className="quietBadge">
                    {mlLastRunAt ? `Updated ${mlLastRunAt}` : 'Waiting for rank'}
                  </span>
                </div>

                {predictingAdmission ? (
                  <div style={{ padding: '18px', color: 'var(--text-secondary)' }}>Processing cutoff data from your profile...</div>
                ) : mlError ? (
                  <div style={{ padding: '18px', color: 'var(--text-secondary)' }}>{mlError}</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '18px' }}>
                    <div className="notesBlock" style={{ padding: '14px' }}>
                      <strong>Profile sent to model</strong>
                      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                        {admissionProfile.exam} / Rank {admissionProfile.score} / {mapCategoryToSeatType(admissionProfile.category)} / All India quota
                      </p>
                    </div>
                    <div className="notesBlock" style={{ padding: '14px' }}>
                      <strong>Top cutoff result</strong>
                      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                        {topMlPrediction ? `${topMlPrediction.institute} - ${topMlPrediction.program} (${topMlPrediction.probability}%)` : 'No cutoff result yet.'}
                      </p>
                    </div>
                  </div>
                )}
              </article>

              {renderTimelinePanel()}
            </>
          )}

          {activeSection === 'onboarding' && renderOnboardingPanel()}
          {activeSection === 'search' && renderSearchPanel()}
          {activeSection === 'matrix' && renderMatrixPanel()}
          {activeSection === 'compare' && renderComparePanel()}
          {activeSection === 'vault' && renderVaultPanel()}
          {activeSection === 'timeline' && renderTimelinePanel()}
          {activeSection === 'reflection' && renderReflectionPanel()}
        </section>
      </main>
    </>
  );
}

export default App;
