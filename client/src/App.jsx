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
  Info,
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
  savePredictionShortlist,
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

function getFriendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || '';
  if (message === 'Failed to fetch' || message.includes('NetworkError')) {
    return 'Server is unavailable. Please check that the API is running, then try again.';
  }
  return message || fallback;
}

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

function scoreCollege(college, priorities, catalog, isClass12 = false) {
  const totalWeight = priorities.reduce((sum, priority) => sum + priority.weight, 0);
  const weightedScore = priorities.reduce((sum, priority) => {
    return sum + normalizeMetric(college, priority.key, catalog) * priority.weight;
  }, 0);

  const fitScore = Math.round((weightedScore / totalWeight) * 100);

  // If we are not in Class 12 planner mode, blend Priority Fit Score (60%) with ML Admission Probability (40%)
  if (!isClass12 && college.mlAdmission?.probability != null) {
    const prob = Number(college.mlAdmission.probability) || 0;
    return Math.round((fitScore * 0.6) + (prob * 0.4));
  }

  return fitScore;
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
  if (probability >= 75) return { label: 'Strong College Vault match', className: 'eligible' };
  if (probability >= 40) return { label: 'Possible College Vault match', className: 'ambiguous' };
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

function predictionToCollege(row, index, catalog = []) {
  const probability = Number(row.probability) || 0;
  const closingRank = Number(row.closingRank) || 0;
  const openingRank = Number(row.openingRank) || closingRank;

  // Enrich prediction stats with full data from matching detailed college if found in catalog
  const matched = catalog.find((c) => {
    const textA = normalizeSearchText(c.name);
    const textB = normalizeSearchText(row.institute);
    return textA.includes(textB) || textB.includes(textA) || c.shortName.toLowerCase() === makeShortName(row.institute).toLowerCase();
  });

  return {
    id: `cutoff-${normalizeSearchText(`${row.institute}-${row.program}-${row.quota}-${row.seatType}-${row.gender}-${index}`).replace(/\s+/g, '-')}`,
    name: row.institute,
    shortName: matched?.shortName || makeShortName(row.institute),
    type: matched?.type || 'Cutoff Dataset Result',
    branch: row.program,
    state: matched?.state || quotaLabel(row.quota),
    city: matched?.city || quotaLabel(row.quota),
    fees: matched?.fees || null,
    avgPackage: matched?.avgPackage || null,
    medianPackage: matched?.medianPackage || null,
    placementRate: matched?.placementRate || null,
    nirfRank: matched?.nirfRank || closingRank || 999999,
    hostel: matched?.hostel || null,
    cutoff: closingRank,
    distanceKm: matched?.distanceKm || null,
    campusLife: matched?.campusLife || null,
    faculty: matched?.faculty || null,
    research: matched?.research || null,
    roi: probability,
    confidence: probability,
    tags: [row.quota, row.seatType, row.gender, 'cutoff dataset', ...(matched?.tags || [])].filter(Boolean),
    pros: matched?.pros?.length ? matched.pros : [
      `${probability}% admission likelihood for the entered rank`,
      `Closing rank ${closingRank} in the selected seat filter`,
    ],
    cons: matched?.cons?.length ? matched.cons : [
      'Fees, hostel, placement, and campus details need manual verification',
    ],
    notes: [],
    rawNotes: [],
    customLinks: [],
    researchLinks: matched?.researchLinks || [],
    status: 'dataset-result',
    isDatasetResult: true,
    admissionChannel: matched?.admissionChannel || ((row.institute.toLowerCase().includes('indian institute of technology') || row.institute.startsWith('IIT '))
      ? 'JEE Advanced'
      : 'JEE Main'),
    mlAdmission: {
      ...row,
      openingRank,
      closingRank,
      probability,
    },
    mlAdmissionStatus: getMlAdmissionStatus(probability),
  };
}

function getStandardizedType(collegeType, collegeName) {
  const t = (collegeType || '').toLowerCase();
  const n = (collegeName || '').toLowerCase();
  if (t.includes('iit') || n.includes('indian institute of technology') || n.startsWith('iit ')) return 'IIT';
  if (t.includes('nit') || n.includes('national institute of technology') || n.startsWith('nit ')) return 'NIT';
  if (t.includes('iiit') || n.includes('indian institute of information technology') || n.startsWith('iiit ')) return 'IIIT';
  if (t.includes('state') || t.includes('government') || t.includes('autonomous')) return 'State University';
  if (t.includes('private') || t.includes('deemed')) return 'Private / Deemed';
  return 'GFTI / Other';
}

function getShortBranch(branchName) {
  if (!branchName) return '';
  const b = branchName.toLowerCase();
  if (b.includes('computer science')) return 'CSE';
  if (b.includes('electrical')) return 'EE';
  if (b.includes('mechanical')) return 'ME';
  if (b.includes('civil')) return 'CE';
  if (b.includes('chemical')) return 'CH';
  if (b.includes('textile')) return 'Textile';
  if (b.includes('mining')) return 'Mining';
  if (b.includes('metallurgical')) return 'Meta';
  return branchName.split(',')[0].slice(0, 8); // First word or part
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
  const [typeFilter, setTypeFilter] = useState('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [shortlistedIds, setShortlistedIds] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [priorities, setPriorities] = useState(defaultPriorities);
  const [decisionId, setDecisionId] = useState('');

  // Vault inputs state
  const [hoveredRoiCollege, setHoveredRoiCollege] = useState(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [newPro, setNewPro] = useState('');
  const [newCon, setNewCon] = useState('');
  const [newNote, setNewNote] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState('Official');

  // Final decision confirm / reflection state
  const [hasConfirmedDecision, setHasConfirmedDecision] = useState(false);
  const [confirmedDecisionId, setConfirmedDecisionId] = useState('');
  const [confirmedDecisionSnapshot, setConfirmedDecisionSnapshot] = useState(null);
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
  const [geminiAnswer, setGeminiAnswer] = useState(null);
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
      showToast(getFriendlyError(err, 'Failed to update profile.'), 'error');
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
    setGeminiAnswer(null);
    try {
      const data = await askGemini(query);
      setGeminiAnswer({
        answer: data.answer,
        source: data.source || (data.fallback ? 'fallback' : 'gemini'),
      });
    } catch (err) {
      showToast(getFriendlyError(err, 'Could not get an admissions answer right now.'), 'error');
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
      showToast(data.source === 'fallback' ? 'Research summarized with local fallback.' : 'Gemini summarized the research successfully!', 'success');
    } catch (err) {
      showToast(getFriendlyError(err, 'Could not summarize this research note right now.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to import AI insights.'), 'error');
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
          mlAdmission: c.cutoffSnapshot || null,
          mlAdmissionStatus: c.cutoffSnapshot ? getMlAdmissionStatus(c.cutoffSnapshot.probability) : null,
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
            setConfirmedDecisionSnapshot(null);
          } else {
            setDecisionId('');
            setConfirmedDecisionSnapshot(null);
          }
        } else if (latestDecision?.selectedCollegeSnapshot?.name) {
          setConfirmedDecisionId(latestDecision._id);
          setHasConfirmedDecision(true);
          setConfirmedDecisionSnapshot(latestDecision.selectedCollegeSnapshot);
          setDecisionId('');
        } else {
          setDecisionId('');
          setConfirmedDecisionSnapshot(null);
        }
      } else {
        setDecisionId('');
        setConfirmedDecisionSnapshot(null);
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
          setAppStage('journey');
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
      setAppStage('journey');
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
      showToast(getFriendlyError(err, 'Failed to delete account.'), 'error');
    }
  };

  const handleOnboardingComplete = async () => {
    // Validate compulsory fields
    const isClass12 = admissionProfile.journey === 'Class 12 planning' || admissionProfile.scoreType === 'Board %';
    if (isClass12) {
      if (!admissionProfile.score || !String(admissionProfile.score).trim()) {
        showToast('Please enter your Board percentage.', 'error');
        return;
      }
      if (!admissionProfile.homeState || !admissionProfile.homeState.trim()) {
        showToast('Please enter your Home State.', 'error');
        return;
      }
      if (!admissionProfile.budget || !admissionProfile.budget.trim()) {
        showToast('Please enter your Budget range.', 'error');
        return;
      }
      if (!admissionProfile.preferredBranches || !admissionProfile.preferredBranches.trim()) {
        showToast('Please enter your Preferred branches.', 'error');
        return;
      }
    } else {
      if (!admissionProfile.score || !String(admissionProfile.score).trim()) {
        showToast(`Please enter your ${admissionProfile.scoreType || 'Rank'}.`, 'error');
        return;
      }
      if (isNaN(Number(admissionProfile.score))) {
        showToast('Please enter a valid numeric rank/score.', 'error');
        return;
      }
      if (!admissionProfile.homeState || !admissionProfile.homeState.trim()) {
        showToast('Please enter your Home State.', 'error');
        return;
      }
      if (!admissionProfile.preferredBranches || !admissionProfile.preferredBranches.trim()) {
        showToast('Please enter your Preferred branches.', 'error');
        return;
      }
    }

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
      showToast(getFriendlyError(err, 'Failed to complete onboarding.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to add pro.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to delete pro.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to add con.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to delete con.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to add note.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to delete note.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to add link.'), 'error');
    }
  };

  const handleConfirmDecision = async () => {
    const selectedCol = shortlisted.find((college) => college.id === decisionId);
    if (!selectedCol?.name) return;
    try {
      setIsLoading(true);
      const reviewDate = new Date();
      reviewDate.setMonth(reviewDate.getMonth() + 6);
      const decisionSnapshot = selectedCol.apiId ? null : {
        name: selectedCol.name,
        shortName: selectedCol.shortName,
        program: selectedCol.branch,
        quota: selectedCol.mlAdmission?.quota,
        seatType: selectedCol.mlAdmission?.seatType,
        gender: selectedCol.mlAdmission?.gender,
        openingRank: selectedCol.mlAdmission?.openingRank,
        closingRank: selectedCol.mlAdmission?.closingRank,
        probability: selectedCol.mlAdmission?.probability,
        source: selectedCol.isDatasetResult ? 'cutoff-dataset' : 'local',
      };

      const { decision } = await createDecision(
        selectedCol.apiId || null,
        selectedCol.score,
        selectedCol.confidence,
        selectedCol.isDatasetResult
          ? [`Selected from cutoff dataset for rank ${admissionProfile.score}: ${selectedCol.branch}, closing rank ${selectedCol.mlAdmission?.closingRank}, admission signal ${selectedCol.mlAdmission?.probability}%.`]
          : [`Selected during onboarding based on fit score of ${selectedCol.score}% against family priorities.`],
        reviewDate,
        decisionSnapshot
      );

      setConfirmedDecisionId(decision._id);
      setHasConfirmedDecision(true);
      await refreshActivities();
      showToast('Decision for ' + selectedCol.name + ' confirmed & saved!', 'success');
    } catch (err) {
      showToast(getFriendlyError(err, 'Failed to save decision.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMlBestFit = async (college) => {
    if (!college) return;
    try {
      setIsLoading(true);
      let apiCollegeId = college.apiId;

      // If it's a prediction from cutoffs that has not been saved yet, save it to the shortlist first
      if (college.isDatasetResult || !apiCollegeId) {
        await savePredictionShortlist({
          institute: college.name,
          program: college.mlAdmission?.program || college.branch,
          quota: college.mlAdmission?.quota || 'AI',
          seatType: college.mlAdmission?.seatType || 'OPEN',
          gender: college.mlAdmission?.gender || 'Gender-Neutral',
          openingRank: college.mlAdmission?.openingRank || 0,
          closingRank: college.mlAdmission?.closingRank || 0,
          probability: college.mlAdmission?.probability || 0,
        });

        // Refresh user data so that local state has this college in catalogs/shortlists
        await loadUserData();

        // Find the new API ID by fetching raw info
        const meData = await getMe();
        const latestShortlist = meData.shortlists?.find(
          (s) => s.college?.name === college.name && s.college?.branch === (college.mlAdmission?.program || college.branch)
        );
        if (latestShortlist) {
          apiCollegeId = latestShortlist._id;
        }
      }

      const reviewDate = new Date();
      reviewDate.setMonth(reviewDate.getMonth() + 6);
      
      const decisionSnapshot = apiCollegeId ? null : {
        name: college.name,
        shortName: college.shortName,
        program: college.mlAdmission?.program || college.branch,
        quota: college.mlAdmission?.quota || 'AI',
        seatType: college.mlAdmission?.seatType || 'OPEN',
        gender: college.mlAdmission?.gender || 'Gender-Neutral',
        openingRank: college.mlAdmission?.openingRank || 0,
        closingRank: college.mlAdmission?.closingRank || 0,
        probability: college.mlAdmission?.probability || 0,
        source: 'cutoff-dataset',
      };

      const { decision } = await createDecision(
        apiCollegeId || null,
        college.score || 100,
        college.mlAdmission?.probability || college.confidence || 90,
        [`Locked directly from recommended Best Fit: ${college.branch}, fit signal ${college.mlAdmission?.probability || college.score}%`],
        reviewDate,
        decisionSnapshot
      );

      await loadUserData();
      setDecisionId(college.id);
      setConfirmedDecisionId(decision._id);
      setHasConfirmedDecision(true);
      await refreshActivities();
      showToast(`Locked ${college.shortName} as your final decision!`, 'success');
      goToSection('reflection');
    } catch (err) {
      showToast(getFriendlyError(err, 'Failed to lock final decision from Best Fit.'), 'error');
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
      showToast(getFriendlyError(err, 'Failed to save reflection.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const isClass12Planner = admissionProfile.journey === 'Class 12 planning' || admissionProfile.scoreType === 'Board %';

  const datasetCatalog = useMemo(
    () => admissionPredictions.map((prediction, index) => predictionToCollege(prediction, index, catalog)),
    [admissionPredictions, catalog],
  );
  const isDatasetDiscovery = datasetCatalog.length > 0;
  const discoveryCatalog = useMemo(() => {
    if (isDatasetDiscovery) {
      // Filter out detailed catalog colleges that are NOT JoSAA-only (e.g. state counseling, BITSAT, private exams)
      const nonJosaa = catalog.filter((c) => {
        const channel = c.admissionChannel || '';
        return channel.includes('JAC') || channel.includes('BITSAT') || channel.includes('WBJEE') || channel.includes('MHT') || channel.includes('UPTAC') || channel.includes('VITEEE') || channel.includes('Thapar') || channel.includes('BIT') || c.type === 'Private University' || c.type === 'State Technical University';
      });

      // Map mock predictions for JEE Main accepting state options (DTU, NSUT, etc.)
      const enrichedNonJosaa = nonJosaa.map((college) => {
        let mlAdmission = null;
        const studentRank = Number(admissionProfile.score);
        if (studentRank && college.admissionChannel?.includes('JEE Main')) {
          const probability = studentRank <= college.cutoff 
            ? Math.round(85 + Math.min(15, ((college.cutoff - studentRank) / college.cutoff) * 15)) 
            : Math.round(Math.max(5, 85 - ((studentRank - college.cutoff) / college.cutoff) * 85));
          mlAdmission = {
            institute: college.name,
            program: college.branch,
            quota: 'State Counselling',
            seatType: 'OPEN',
            gender: 'Gender-Neutral',
            openingRank: Math.round(college.cutoff * 0.8),
            closingRank: college.cutoff,
            probability: Math.min(100, Math.max(5, probability)),
            isNonJosaaStateOption: true,
          };
        }
        return {
          ...college,
          mlAdmission,
          mlAdmissionStatus: getMlAdmissionStatus(mlAdmission?.probability),
        };
      });

      return [...datasetCatalog, ...enrichedNonJosaa];
    }
    return catalog;
  }, [isDatasetDiscovery, datasetCatalog, catalog, admissionProfile.score]);

  const states = ['All', ...new Set(discoveryCatalog.map((college) => college.state))];
  const branches = ['All', ...new Set(discoveryCatalog.map((college) => college.branch))];

  const scoredSavedColleges = useMemo(() => {
    return catalog
      .map((college) => {
        const eligibilityInfo = checkEligibility(college, admissionProfile);
        const mlAdmission = isClass12Planner
          ? null
          : (getAdmissionPredictionForCollege(college, admissionPredictions) || (admissionPredictions.length > 0 ? null : college.mlAdmission));
        const mlAdmissionStatus = getMlAdmissionStatus(mlAdmission?.probability);
        return {
          ...college,
          score: scoreCollege({ ...college, mlAdmission }, priorities, catalog, isClass12Planner),
          eligibility: eligibilityInfo,
          mlAdmission,
          mlAdmissionStatus,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [catalog, priorities, admissionProfile, admissionPredictions, isClass12Planner]);

  const scoredDiscoveryColleges = useMemo(() => {
    return discoveryCatalog
      .map((college) => {
        const eligibilityInfo = checkEligibility(college, admissionProfile);
        const mlAdmission = isClass12Planner
          ? null
          : (getAdmissionPredictionForCollege(college, admissionPredictions) || (admissionPredictions.length > 0 ? null : college.mlAdmission));
        const mlAdmissionStatus = getMlAdmissionStatus(mlAdmission?.probability);
        return {
          ...college,
          score: scoreCollege({ ...college, mlAdmission }, priorities, discoveryCatalog, isClass12Planner),
          eligibility: eligibilityInfo,
          mlAdmission,
          mlAdmissionStatus,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [discoveryCatalog, priorities, admissionProfile, admissionPredictions, isClass12Planner]);

  const filteredColleges = scoredDiscoveryColleges.filter((college) => {
    const searchTarget = `${college.name} ${college.shortName} ${college.branch} ${college.state} ${college.tags.join(' ')}`.toLowerCase();
    const matchesQuery = searchTarget.includes(query.toLowerCase());
    const matchesState = stateFilter === 'All' || college.state === stateFilter;
    const matchesBranch = branchFilter === 'All' || college.branch === branchFilter;
    const collegeType = getStandardizedType(college.type, college.name);
    const matchesType = typeFilter === 'All' || collegeType === typeFilter;
    return matchesQuery && matchesState && matchesBranch && matchesType;
  });

  const shortlisted = scoredSavedColleges.filter((college) => shortlistedIds.includes(college.id));
  const vaultColleges = shortlisted.length ? shortlisted : scoredSavedColleges.filter((college) => college.shortlistId);
  const selectedCollege = vaultColleges.length
    ? (vaultColleges.find((college) => college.id === selectedId) || vaultColleges[0])
    : (scoredSavedColleges.find((college) => college.id === selectedId) || scoredSavedColleges[0] || { name: '', shortName: '', score: 0, pros: [], cons: [], tags: [], researchLinks: [] });
  const finalCollege = shortlisted.find((college) => college.id === decisionId) || shortlisted[0] || selectedCollege || { name: '', shortName: '', score: 0, confidence: 0 };
  const topMlPrediction = admissionPredictions[0] || null;
  const bestMlCollege = scoredDiscoveryColleges[0] || null;
  const mlMatchedShortlistCount = shortlisted.filter((college) => college.mlAdmission).length;
  const recommendedCollege = isClass12Planner
    ? (scoredSavedColleges[0] || null)
    : bestMlCollege;
  const topRecommendations = isClass12Planner
    ? scoredSavedColleges.slice(0, 3)
    : scoredDiscoveryColleges.slice(0, 3);

  useEffect(() => {
    if (selectedId && scoredSavedColleges.some((college) => college.id === selectedId)) return;
    const nextSelected = shortlisted[0]?.id || scoredSavedColleges[0]?.id || '';
    if (nextSelected) {
      setSelectedId(nextSelected);
    }
  }, [selectedId, shortlisted, scoredSavedColleges]);

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
    setToasts([]);
    setActiveSection(sectionId);
    if (sectionId === 'onboarding') {
      setEditProfile({ ...admissionProfile });
    }
  }

  async function toggleShortlist(id) {
    const college = catalog.find((c) => c.id === id);
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
      showToast(getFriendlyError(err, 'Failed to update shortlist.'), 'error');
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

  async function handleSavePrediction(college) {
    if (!college?.mlAdmission) return;
    try {
      setIsLoading(true);
      await savePredictionShortlist({
        institute: college.name,
        program: college.mlAdmission.program || college.branch,
        quota: college.mlAdmission.quota || 'AI',
        seatType: college.mlAdmission.seatType || 'OPEN',
        gender: college.mlAdmission.gender || 'Gender-Neutral',
        openingRank: college.mlAdmission.openingRank || 0,
        closingRank: college.mlAdmission.closingRank || 0,
        probability: college.mlAdmission.probability || 0,
      });
      await loadUserData();
      showToast(`Saved ${college.shortName || college.name} prediction to shortlist.`, 'success');
    } catch (err) {
      showToast(getFriendlyError(err, 'Failed to save prediction.'), 'error');
    } finally {
      setIsLoading(false);
    }
  }

  async function runAdmissionMl(profile = admissionProfile) {
    const rank = getRankFromProfile(profile);

    if (profile.journey === 'Class 12 planning' || profile.scoreType === 'Board %') {
      setAdmissionPredictions([]);
      setMlLastRunAt('');
      setMlError('');
      return;
    }

    if (!currentUser || !rank) {
      setAdmissionPredictions([]);
      setMlLastRunAt('');
      setMlError('Enter a valid rank in your profile to unlock automatic College Vault admission guidance.');
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
      setMlError(getFriendlyError(err, 'College Vault admission guidance is unavailable right now.'));
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
          if (admissionProfile.journey !== 'Class 12 planning') {
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
          }
          setAppStage('class12-intake');
        }}
        onEntrance={() => {
          if (admissionProfile.journey !== 'Entrance result ready') {
            setAdmissionProfile({
              journey: 'Entrance result ready',
              exam: 'JEE Main',
              scoreType: 'Rank',
              score: '8900',
              category: 'General',
              homeState: '',
              preferredBranches: '',
              stream: '',
              budget: '',
              targetExam: '',
              fileName: '',
              scorecardBase64: '',
            });
          } else {
            setAdmissionProfile((current) => ({
              ...current,
              journey: 'Entrance result ready',
              exam: current.exam === 'Class 12' ? 'JEE Main' : current.exam,
              scoreType: current.scoreType === 'Board %' ? 'Rank' : current.scoreType,
              score: current.scoreType === 'Board %' ? '8900' : current.score,
            }));
          }
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
      showToast(getFriendlyError(err, 'Admission prediction failed.'), 'error');
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
      showToast(getFriendlyError(err, 'Placement prediction failed.'), 'error');
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
            <strong>
              {isDatasetDiscovery
                ? 'Using uploaded cutoff dataset'
                : isClass12Planner
                  ? 'Early planning college discovery'
                  : 'Showing fallback seed colleges'}
            </strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              {isDatasetDiscovery
                ? `${admissionPredictions.length} dataset programs loaded for rank ${admissionProfile.score || jeeRank}.`
                : isClass12Planner
                  ? 'Explore colleges by branch, state, fees, placements, and fit. Add a JEE rank later to unlock cutoff predictions.'
                  : 'Save a valid rank in Onboarding to load dataset-backed college/program results automatically.'}
            </p>
          </div>
          {mlLastRunAt && <span className="quietBadge">Updated {mlLastRunAt}</span>}
        </div>

        {mlError && !isClass12Planner && <small style={{ color: '#c0392b', fontWeight: 700 }}>{mlError}</small>}
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

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          {['All', 'IIT', 'NIT', 'IIIT', 'State University', 'Private / Deemed', 'GFTI / Other'].map((type) => (
            <option key={type} value={type}>{type === 'All' ? 'All Types' : type}</option>
          ))}
        </select>

        <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
          {states.map((state) => (
            <option key={state} value={state}>{state === 'All' ? 'All States' : state}</option>
          ))}
        </select>

        <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          {branches.map((branch) => (
            <option key={branch} value={branch}>{branch === 'All' ? 'All Branches' : branch}</option>
          ))}
        </select>
      </div>

      <div className="collegeList">
        {filteredColleges.length === 0 && (
          <div className="emptyState">
            <strong>No colleges found</strong>
            <p>
              Try a different search term, clear one filter, or switch the branch/state selection.
            </p>
            <button
              type="button"
              className="textButton"
              onClick={() => {
                setQuery('');
                setStateFilter('All');
                setBranchFilter('All');
                setTypeFilter('All');
              }}
            >
              Clear filters
            </button>
          </div>
        )}

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
              {college.admissionChannel && (
                <span className="admissionChannelBadge" style={{ background: 'rgba(108, 92, 231, 0.12)', color: '#6c5ce7', border: '1px solid rgba(108, 92, 231, 0.25)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                  Exam: {college.admissionChannel}
                </span>
              )}
              {college.mlAdmission && (
                <span className={`eligibilityBadge ${college.mlAdmissionStatus.className}`} title={`${college.mlAdmission.program} / closing rank ${college.mlAdmission.closingRank}`}>
                  Vault {college.mlAdmission.probability}%
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

            {college.isDatasetResult ? (
              <button
                type="button"
                className="textButton savePredictionButton"
                onClick={() => handleSavePrediction(college)}
                style={{ gridRow: '1 / 2', gridColumn: '2 / 3', alignSelf: 'center' }}
                title="This is a cutoff prediction, not a saved shortlist item."
              >
                Save prediction
              </button>
            ) : (
              <button
                className={`iconAction ${shortlistedIds.includes(college.id) ? 'on' : ''}`}
                onClick={() => toggleShortlist(college.id)}
                aria-label={`${shortlistedIds.includes(college.id) ? 'Remove' : 'Add'} ${college.name}`}
                style={{ gridRow: '1 / 2', gridColumn: '2 / 3', alignSelf: 'center' }}
              >
                <Check size={17} />
              </button>
            )}

            {selectedCollege.id === college.id && (
              <div className="scoreExplainability" style={{ gridColumn: '1 / -1', marginTop: '10px', background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', fontSize: '0.78rem', borderLeft: '4px solid #526b35', textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Fit Score Contribution Breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {priorities.map((priority) => {
                    const normalized = normalizeMetric(college, priority.key, discoveryCatalog);
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
          <h3>Saved college comparison</h3>
        </div>
        <span className="quietBadge">{shortlisted.length} saved</span>
      </div>

      {shortlisted.length === 0 ? (
        <div className="emptyState">
          <strong>No saved colleges yet</strong>
          <p>Add colleges from Discovery to compare fees, placements, hostel, distance, and research quality.</p>
          <button type="button" className="textButton" onClick={() => goToSection('search')}>
            Open Discovery
          </button>
        </div>
      ) : (
        <>
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

          {shortlisted.length === 1 && (
            <div className="emptyState compact">
              <strong>Add one more saved college</strong>
              <p>Trade-off analysis appears once at least two saved colleges are available.</p>
            </div>
          )}

          {shortlisted.length >= 2 && (() => {
            const c1 = shortlisted[0];
            const c2 = shortlisted[1];
            const diffPackage = c1.avgPackage - c2.avgPackage;
            const diffFees = c1.fees - c2.fees;
            const diffDistance = c1.distanceKm - c2.distanceKm;
            const diffCampus = c1.campusLife - c2.campusLife;
            return (
              <div className="tradeOffCard" style={{ margin: '15px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '15px', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  <SlidersHorizontal size={16} />
                  Smart Trade-Off Analysis (Top 2 Saved Choices)
                </div>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>
                  Comparing your top match <strong>{c1.name}</strong> against your second option <strong>{c2.name}</strong>:
                </p>
                <ul style={{ margin: '0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Fit Margin</strong>: <strong>{c1.shortName}</strong> is rated <strong>+{c1.score - c2.score}%</strong> higher in total priority alignment.</li>
                  <li><strong>Placement & Earnings</strong>: {diffPackage > 0 ? <span>Gains an estimated average salary increase of <strong style={{ color: '#1f8a4c' }}>+{diffPackage.toFixed(1)} LPA</strong>.</span> : <span>Sacrifices an estimated <strong style={{ color: '#b42318' }}>{Math.abs(diffPackage).toFixed(1)} LPA</strong> in average salary.</span>}</li>
                  <li><strong>Academic Cost</strong>: {diffFees > 0 ? <span>Increases total expense by <strong style={{ color: '#b42318' }}>{formatFee(diffFees)}</strong>.</span> : <span>Saves you <strong style={{ color: '#1f8a4c' }}>{formatFee(Math.abs(diffFees))}</strong> in total fees.</span>}</li>
                  <li><strong>Location Fit</strong>: {diffDistance > 0 ? <span>Places you <strong style={{ color: '#b42318' }}>{diffDistance} km</strong> further from home.</span> : <span>Places you <strong style={{ color: '#1f8a4c' }}>{Math.abs(diffDistance)} km</strong> closer to home.</span>}</li>
                  <li><strong>Campus Experience</strong>: {diffCampus > 0 ? <span>Features a higher campus satisfaction rating (<strong style={{ color: '#1f8a4c' }}>+{diffCampus.toFixed(1)}/10</strong>).</span> : <span>Features a slightly lower campus satisfaction rating (<strong style={{ color: '#b42318' }}>-{Math.abs(diffCampus).toFixed(1)}/10</strong>).</span>}</li>
                </ul>
              </div>
            );
          })()}
        </>
      )}

      {datasetCatalog.length > 0 && (
        <div className="comparisonSection">
          <div className="panelHeader subtle">
            <div>
              <p className="eyebrow">College Vault predictions</p>
              <h3>Cutoff matches for rank {admissionProfile.score || jeeRank}</h3>
            </div>
            <span className="quietBadge">{datasetCatalog.length} matches</span>
          </div>
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
                {datasetCatalog.slice(0, 12).map((college) => (
                  <tr key={college.id}>
                    <td><strong>{college.name}</strong></td>
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
          <p className="helperText">
            These are cutoff predictions only. Save real colleges from Discovery before using Vault notes, links, and final decision reflection.
          </p>
        </div>
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
        <strong>{isClass12Planner ? 'Planning context:' : 'Rank model context:'}</strong>{' '}
        {isClass12Planner
          ? 'You are in Class 12 planning mode. Use the sliders to explore trade-offs before entrance results arrive.'
          : bestMlCollege
          ? `${bestMlCollege.shortName} currently has the strongest seeded cutoff signal at ${bestMlCollege.mlAdmission?.probability || 0}%.`
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

      <div style={{ display: 'grid', gridTemplateColumns: vaultColleges.length > 0 ? '1.1fr 0.9fr' : '1fr', gap: '24px', padding: '18px', borderTop: '1px dashed var(--border-color)', marginTop: '10px' }}>
        
        {/* Left Column: Interactive SVG ROI Value Chart */}
        {vaultColleges.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Chart 1: Scatter Plot */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p className="eyebrow" style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0 }}>
                📊 Value Matrix: Fees vs. Placements (Scatter Trade-off)
              </p>
              <div style={{ position: 'relative', width: '100%', height: '220px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px 16px 8px 16px', boxSizing: 'border-box' }}>
                <svg viewBox="0 0 400 220" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Axes lines */}
                  <line x1="45" y1="15" x2="45" y2="175" stroke="var(--border-color)" strokeWidth="1.5" />
                  <line x1="45" y1="175" x2="385" y2="175" stroke="var(--border-color)" strokeWidth="1.5" />

                  {/* Grid Lines & Y-ticks */}
                  {[10, 20, 30, 40].map((pkg) => {
                    const y = 175 - (pkg / 40) * 160;
                    return (
                      <g key={pkg}>
                        <line x1="45" y1={y} x2="385" y2={y} stroke="var(--border-color)" strokeDasharray="3,3" strokeWidth="1" />
                        <text x="38" y={y + 3} fill="var(--text-secondary)" fontSize="8.5" textAnchor="end">{pkg}L</text>
                      </g>
                    );
                  })}

                  {/* Grid Lines & X-ticks */}
                  {[0, 3, 6, 9, 12].map((fee) => {
                    const x = 45 + (fee / 12) * 340;
                    return (
                      <g key={fee}>
                        <line x1={x} y1="15" x2={x} y2="175" stroke="var(--border-color)" strokeDasharray="3,3" strokeWidth="1" />
                        <text x={x} y="188" fill="var(--text-secondary)" fontSize="8.5" textAnchor="middle">{fee === 0 ? '0' : `${fee}L`}</text>
                      </g>
                    );
                  })}

                  {/* Axis Titles */}
                  <text x="215" y="208" fill="var(--text-secondary)" fontSize="9" fontWeight="bold" textAnchor="middle">Tuition Fees (Lakhs)</text>
                  <text x="12" y="95" fill="var(--text-secondary)" fontSize="9" fontWeight="bold" transform="rotate(-90 12 95)" textAnchor="middle">Average Salary (LPA)</text>

                  {/* Quadrant Guide Labels */}
                  <text x="380" y="26" fill="rgba(108, 92, 231, 0.45)" fontSize="8" fontWeight="bold" textAnchor="end">💎 High return</text>
                  <text x="55" y="26" fill="rgba(39, 174, 96, 0.65)" fontSize="8" fontWeight="bold" textAnchor="start">🔥 Elite ROI</text>
                  <text x="380" y="165" fill="rgba(230, 126, 34, 0.45)" fontSize="8" fontWeight="bold" textAnchor="end">⚠️ Premium Fees</text>

                  {/* Data points */}
                  {vaultColleges.map((college) => {
                    const feeLakhs = college.fees ? (college.fees / 100000) : 0;
                    const pkg = college.avgPackage || 0;
                    const isLeader = finalCollege.name === college.name;

                    // Map coordinates
                    const x = 45 + Math.min(1, Math.max(0, feeLakhs / 12)) * 340;
                    const y = 175 - Math.min(1, Math.max(0, pkg / 40)) * 160;

                    return (
                      <g key={college.id}>
                        <circle
                          cx={x}
                          cy={y}
                          r={isLeader ? 7.5 : 6}
                          fill={isLeader ? '#27ae60' : '#6c5ce7'}
                          stroke={isLeader ? '#fff' : 'rgba(255, 255, 255, 0.8)'}
                          strokeWidth={isLeader ? 2 : 1}
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={(e) => {
                            setHoveredRoiCollege({
                              college,
                              x: x,
                              y: y - 10
                            });
                          }}
                          onMouseLeave={() => setHoveredRoiCollege(null)}
                        />
                        {isLeader && (
                          <circle
                            cx={x}
                            cy={y}
                            r="11"
                            fill="none"
                            stroke="#27ae60"
                            strokeWidth="1"
                            strokeDasharray="2,2"
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Custom Tooltip */}
                {hoveredRoiCollege && (
                  <div 
                    style={{
                      position: 'absolute',
                      left: `${(hoveredRoiCollege.x / 400) * 100}%`,
                      bottom: `${100 - (hoveredRoiCollege.y / 220) * 100 + 4}%`,
                      transform: 'translateX(-50%)',
                      background: 'rgba(17, 24, 39, 0.95)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      border: '1px solid #6c5ce7',
                      fontSize: '0.78rem',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px'
                    }}
                  >
                    <strong style={{ color: '#a29bfe' }}>{hoveredRoiCollege.college.name}</strong>
                    <div style={{ color: '#ccc' }}>Program: <span style={{ color: '#fff', fontWeight: 'bold' }}>{hoveredRoiCollege.college.branch || 'CSE'}</span></div>
                    <div style={{ color: '#ccc' }}>Fees: <strong>INR {hoveredRoiCollege.college.fees ? `${(hoveredRoiCollege.college.fees/100000).toFixed(2)} Lakhs` : 'Dataset only'}</strong></div>
                    <div style={{ color: '#ccc' }}>Average Package: <strong>{hoveredRoiCollege.college.avgPackage ? `${hoveredRoiCollege.college.avgPackage} LPA` : 'Dataset only'}</strong></div>
                    <div style={{ color: '#ccc' }}>Priority Fit Score: <strong style={{ color: '#2dfc52' }}>{hoveredRoiCollege.college.score}%</strong></div>
                  </div>
                )}
              </div>
            </div>

            {/* Chart 2: Grouped Bar Chart */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p className="eyebrow" style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: 0 }}>
                📊 Absolute comparison: Fees (Lakhs) vs Average Package (LPA)
              </p>
              <div style={{ position: 'relative', width: '100%', height: '180px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px 16px 8px 16px', boxSizing: 'border-box' }}>
                <svg viewBox="0 0 400 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Axes lines */}
                  <line x1="45" y1="10" x2="45" y2="125" stroke="var(--border-color)" strokeWidth="1.5" />
                  <line x1="45" y1="125" x2="385" y2="125" stroke="var(--border-color)" strokeWidth="1.5" />

                  {/* Grid Lines & Y-ticks */}
                  {[10, 20, 30, 40].map((val) => {
                    const y = 125 - (val / 40) * 115;
                    return (
                      <g key={val}>
                        <line x1="45" y1={y} x2="385" y2={y} stroke="var(--border-color)" strokeDasharray="3,3" strokeWidth="1" />
                        <text x="38" y={y + 3} fill="var(--text-secondary)" fontSize="8.5" textAnchor="end">{val}</text>
                      </g>
                    );
                  })}

                  {/* Bars rendering */}
                  {vaultColleges.map((college, idx) => {
                    const feeLakhs = college.fees ? (college.fees / 100000) : 0;
                    const pkg = college.avgPackage || 0;
                    const isLeader = finalCollege.name === college.name;

                    const groupWidth = 340 / vaultColleges.length;
                    const barWidth = Math.min(18, groupWidth / 3.5);
                    const spacing = 4;
                    const startX = 45 + idx * groupWidth + (groupWidth - (2 * barWidth + spacing)) / 2;

                    // Heights
                    const feeHeight = Math.min(115, (feeLakhs / 12) * 115);
                    const pkgHeight = Math.min(115, (pkg / 40) * 115);

                    // Y positions
                    const feeY = 125 - feeHeight;
                    const pkgY = 125 - pkgHeight;

                    return (
                      <g key={college.id}>
                        {/* Fee Bar */}
                        <rect
                          x={startX}
                          y={feeY}
                          width={barWidth}
                          height={feeHeight}
                          fill="#e67e22"
                          rx="2"
                          style={{ transition: 'all 0.3s ease' }}
                        />
                        {/* Package Bar */}
                        <rect
                          x={startX + barWidth + spacing}
                          y={pkgY}
                          width={barWidth}
                          height={pkgHeight}
                          fill="#27ae60"
                          rx="2"
                          style={{ transition: 'all 0.3s ease' }}
                        />
                        {/* College Shortname Label */}
                        <text
                          x={startX + barWidth + spacing / 2}
                          y="138"
                          fill={isLeader ? '#27ae60' : 'var(--text-primary)'}
                          fontSize="9"
                          fontWeight={isLeader ? 'bold' : 'normal'}
                          textAnchor="middle"
                        >
                          {college.shortName}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {/* Legend indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '4px', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#e67e22', borderRadius: '2px' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>Tuition Fee (Lakhs)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#27ae60', borderRadius: '2px' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>Average Package (LPA)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="notesBlock" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <strong>No shortlist data yet</strong>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Add colleges to your shortlist/Vault on the Discovery page to populate the ROI value scatter matrix comparison.
            </p>
          </div>
        )}

        {/* Right Column: Sliders List */}
        <div>
          <p className="eyebrow" style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            ⚙️ Slider Weights (1-5 Scale)
          </p>
          <div className="priorityList" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {priorities.map((priority) => (
              <label className="priorityItem" key={priority.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.8rem' }}>{priority.label}</strong>
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
        </div>

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
        <select value={vaultColleges.some((c) => c.id === selectedId) ? selectedId : (vaultColleges[0]?.id || '')} onChange={(e) => setSelectedId(e.target.value)} disabled={!vaultColleges.length} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '6px' }}>
          {vaultColleges.map((c) => (
            <option value={c.id} key={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {vaultColleges.length === 0 ? (
        <div className="emptyState">
          <strong>No saved colleges in the Vault</strong>
          <p>Save a real college from Discovery before adding pros, cons, research notes, and evidence links.</p>
          <button type="button" className="textButton" onClick={() => goToSection('search')}>
            Open Discovery
          </button>
        </div>
      ) : (
        <>
      {topRecommendations.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '0 20px 20px' }}>
          {topRecommendations.map((college, idx) => (
            <div key={college.id} className="mlBestFitBanner" style={{ margin: 0, padding: '16px', background: 'rgba(108, 92, 231, 0.08)', border: '1px solid rgba(108, 92, 231, 0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c5ce7', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ⭐ Best Fit #{idx + 1}
                </span>
                <h4 style={{ margin: '6px 0 2px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>{college.name}</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {isClass12Planner 
                    ? `Scores ${college.score}% against your family priorities.` 
                    : `${college.branch || 'Computer Science'} — ${college.mlAdmission?.probability || 95}% admission likelihood.`}
                </p>
              </div>
              <button 
                type="button" 
                className="primaryAction" 
                disabled={hasConfirmedDecision}
                style={{ width: '100%', minHeight: '32px', margin: 0, padding: '6px 12px', fontSize: '0.75rem', opacity: hasConfirmedDecision ? 0.6 : 1, cursor: hasConfirmedDecision ? 'not-allowed' : 'pointer' }} 
                onClick={() => handleConfirmMlBestFit(college)}
              >
                {hasConfirmedDecision && confirmedDecisionSnapshot?.name === college.name ? 'Decision Locked' : 'Lock as Final Decision'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="notesBlock" style={{ padding: '14px', margin: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
        <strong>College Vault admission signal</strong>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', padding: '20px' }}>
        {/* Left Column: College Stats & Ratings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 1: College Specs & Information */}
          <div className="notesBlock" style={{ padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              ℹ️ College Information & Stats
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: '0.84rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Institute Type</span>
                <strong>{selectedCollege.type || 'Dataset only'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admission Exam</span>
                <strong>{selectedCollege.admissionChannel || 'JEE Main'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>NIRF Rank</span>
                <strong>{selectedCollege.nirfRank && selectedCollege.nirfRank < 9999 ? `#${selectedCollege.nirfRank}` : 'Not ranked'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hostel Facility</span>
                <strong>{selectedCollege.hostel ? 'Available on campus' : 'Not available'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Academic Fees</span>
                <strong>{formatFee(selectedCollege.fees)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Salary Package</span>
                <strong>{formatPackage(selectedCollege.avgPackage)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Median Salary Package</span>
                <strong>{formatPackage(selectedCollege.medianPackage)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Placement Rate</span>
                <strong>{selectedCollege.placementRate ? `${selectedCollege.placementRate}%` : 'Dataset only'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</span>
                <strong>{selectedCollege.city}, {selectedCollege.state}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance from home</span>
                <strong>{selectedCollege.distanceKm ? `${selectedCollege.distanceKm} km` : 'Dataset only'}</strong>
              </div>
            </div>
          </div>

          {/* Card 2: Ratings & Quality Metrics */}
          <div className="notesBlock" style={{ padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              📊 Quality & fit metrics (Out of 10)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
              {[
                { label: 'Campus Life & Culture', val: selectedCollege.campusLife },
                { label: 'Faculty & Academics Quality', val: selectedCollege.faculty },
                { label: 'Research & Labs Output', val: selectedCollege.research },
                { label: 'Return on Investment (ROI)', val: selectedCollege.roi },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <strong>{val ? `${val}/10` : 'N/A'}</strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val || 0) * 10}%`, background: '#6c5ce7', borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Pros & Cons (Read-only) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="decisionList" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <h4 style={{ color: '#27ae60', margin: '0 0 12px 0', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                ✅ Pros
              </h4>
              {selectedCollege.pros?.length > 0 ? (
                selectedCollege.pros.map((pro, index) => (
                  <p key={index} style={{ fontSize: '0.82rem', margin: '6px 0', paddingLeft: '12px', textIndent: '-12px', color: 'var(--text-primary)' }}>
                    • {pro}
                  </p>
                ))
              ) : (
                <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No pros listed.</p>
              )}
            </div>
            <div className="decisionList" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <h4 style={{ color: '#c0392b', margin: '0 0 12px 0', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                ❌ Cons
              </h4>
              {selectedCollege.cons?.length > 0 ? (
                selectedCollege.cons.map((con, index) => (
                  <p key={index} style={{ fontSize: '0.82rem', margin: '6px 0', paddingLeft: '12px', textIndent: '-12px', color: 'var(--text-primary)' }}>
                    • {con}
                  </p>
                ))
              ) : (
                <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No cons listed.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Q&A Counselor & Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Gemini AI Q&A Counselor */}
          <div className="aiCounselor" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6c5ce7', margin: '0 0 10px 0' }}>
              <Sparkles size={16} /> Google Gemini Admissions Counselor Q&A
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Ask specific questions such as "Will I get CSE at this rank?" or "How is hostel mess here?".
            </p>
            <form onSubmit={handleAskGemini} style={{ display: 'flex', gap: '8px' }}>
              <input
                value={geminiQuestion}
                onChange={(e) => setGeminiQuestion(e.target.value)}
                placeholder="Type your Q&A question here..."
                style={{ flex: 1, padding: '8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
                required
              />
              <button type="submit" className="primaryAction" style={{ padding: '8px 16px', fontSize: '0.8rem', width: 'auto' }} disabled={geminiQaLoading}>
                {geminiQaLoading ? 'Asking...' : 'Ask'}
              </button>
            </form>
            {geminiAnswer && (
              <div className="notesBlock" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-app)', borderLeft: '3px solid #6c5ce7', fontSize: '0.82rem', whiteSpace: 'pre-line' }}>
                {geminiAnswer.source === 'fallback' && (
                  <span className="quietBadge" style={{ marginBottom: '8px', display: 'inline-flex' }}>
                    Local fallback answer
                  </span>
                )}
                <div>{geminiAnswer.answer}</div>
              </div>
            )}
          </div>

          {/* Placement & ROI Analytics */}
          <div className="notesBlock" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              📈 Placement & ROI Analytics
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Placement Success Rate Gauge */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Placement Success Rate</span>
                  <strong style={{ color: '#27ae60' }}>{selectedCollege.placementRate ? `${selectedCollege.placementRate}%` : 'Dataset only'}</strong>
                </div>
                <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${selectedCollege.placementRate || 0}%`, background: '#27ae60', borderRadius: '4px' }} />
                </div>
              </div>

              {/* Salary Packages Comparison Meters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-app)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Salary Package Benchmark (LPA)
                </div>
                
                {/* Average Package */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                    <span>Average Package</span>
                    <strong>{formatPackage(selectedCollege.avgPackage)}</strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, ((selectedCollege.avgPackage || 0) / 45) * 100)}%`, background: '#6c5ce7', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Median Package */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                    <span>Median Package</span>
                    <strong>{formatPackage(selectedCollege.medianPackage)}</strong>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, ((selectedCollege.medianPackage || 0) / 45) * 100)}%`, background: '#00cec9', borderRadius: '3px' }} />
                  </div>
                </div>
              </div>

              {/* ROI & Cost-Benefit Ratio Tag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>ROI Score:</span>{' '}
                  <strong>{selectedCollege.roi ? `${selectedCollege.roi}/10` : 'N/A'}</strong>
                </div>
                {selectedCollege.avgPackage && selectedCollege.fees ? (() => {
                  const feeInLakhs = selectedCollege.fees / 100000;
                  const ratio = feeInLakhs > 0 ? (selectedCollege.avgPackage / feeInLakhs) : 999;
                  let badgeText = '⚖️ Balanced ROI';
                  let badgeBg = 'rgba(120, 120, 120, 0.12)';
                  let badgeColor = 'var(--text-secondary)';

                  if (ratio >= 15) {
                    badgeText = '🔥 Elite ROI Ratio';
                    badgeBg = 'rgba(39, 174, 96, 0.12)';
                    badgeColor = '#27ae60';
                  } else if (ratio >= 6) {
                    badgeText = '✅ High ROI Ratio';
                    badgeBg = 'rgba(39, 174, 96, 0.12)';
                    badgeColor = '#27ae60';
                  } else if (ratio < 2.5) {
                    badgeText = '⚠️ Premium Fees';
                    badgeBg = 'rgba(230, 126, 34, 0.12)';
                    badgeColor = '#e67e22';
                  }
                  
                  return (
                    <span style={{ background: badgeBg, color: badgeColor, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      {badgeText}
                    </span>
                  );
                })() : null}
              </div>

            </div>
          </div>

          {/* Evidence and Reference Links */}
          <div className="researchLinks" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <Link2 size={16} /> Reference & Information Links
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedCollege.researchLinks?.length > 0 ? (
                selectedCollege.researchLinks.map((link, index) => (
                  <a 
                    href={link.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    key={`${link.label}-${index}`} 
                    style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      alignItems: 'center', 
                      textDecoration: 'none', 
                      color: '#6c5ce7', 
                      fontSize: '0.82rem', 
                      padding: '8px 12px', 
                      background: 'var(--bg-app)', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)',
                      transition: 'background 0.2s'
                    }}
                  >
                    <Link2 size={14} />
                    <strong>{link.label}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({link.type})</span>
                  </a>
                ))
              ) : (
                <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No links available.</p>
              )}
            </div>
          </div>

          {/* Personal Research Notes (Read-only) */}
          {selectedCollege.rawNotes?.length > 0 && (
            <div className="notesBlock" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                📝 Saved Research Notes
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedCollege.rawNotes.map((note) => (
                  <div key={note._id} style={{ fontSize: '0.82rem', padding: '10px', background: 'var(--bg-app)', borderRadius: '6px', borderLeft: '3px solid var(--text-secondary)', color: 'var(--text-primary)' }}>
                    {note.body}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
        </>
      )}
    </section>
  );

  const renderReflectionPanel = () => {
    const confirmedCollege = (hasConfirmedDecision && confirmedDecisionSnapshot)
      ? {
          name: confirmedDecisionSnapshot.name,
          shortName: confirmedDecisionSnapshot.shortName || confirmedDecisionSnapshot.name.slice(0, 8),
          branch: confirmedDecisionSnapshot.program,
          score: 100,
          confidence: confirmedDecisionSnapshot.probability || 90,
          isDatasetResult: confirmedDecisionSnapshot.source === 'cutoff-dataset',
        }
      : (shortlisted.find((college) => college.id === decisionId) || null);

    return (
      <section className="panel" style={{ width: '100%', animation: 'fadeIn 0.2s ease' }}>
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Final decision</p>
            <h3>Lock Seat & 6-Month Reflection</h3>
          </div>
          <select value={decisionId} onChange={(event) => setDecisionId(event.target.value)} disabled={hasConfirmedDecision} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <option value="">-- Choose a college --</option>
            {shortlisted.map((college) => (
              <option value={college.id} key={college.id}>
                {college.shortName}
              </option>
            ))}
          </select>
        </div>

        <div style={{ padding: '24px', maxWidth: '800px' }}>
          {confirmedCollege ? (
            <div className="decisionSummary" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-app)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
              <span className="decisionLogo" style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#526b35', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                {(confirmedCollege.shortName || confirmedCollege.name).slice(0, 2)}
              </span>
              <div>
                <strong style={{ fontSize: '1.1rem', display: 'block' }}>{confirmedCollege.name}</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {confirmedCollege.branch ? `${confirmedCollege.branch} — ` : ''}Best balance of ROI, placement signal, coding culture, and practical fit.
                </p>
              </div>
            </div>
          ) : (
            <div className="decisionSummary" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-app)', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px dashed var(--border-color)', justifyContent: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No college decision confirmed yet. Please select a college from the dropdown above to review and lock it in.
              </p>
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            {hasConfirmedDecision ? (
              <span style={{ color: '#1e7e34', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} /> Decision Confirmed & Locked to MongoDB
              </span>
            ) : (
              <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '8px' }}>
                <small style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  {decisionId ? 'Ready to lock this choice? Confirming will save it to the database.' : 'Please select a college from the dropdown menu first.'}
                </small>
                <button 
                  type="button" 
                  onClick={handleConfirmDecision} 
                  className="primaryAction" 
                  disabled={!decisionId}
                  style={{ width: 'auto', padding: '10px 20px', opacity: decisionId ? 1 : 0.5, cursor: decisionId ? 'pointer' : 'not-allowed' }}
                >
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
  };

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
            <h4>Trained College Vault Outputs</h4>
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
              <strong>College Vault Diagnostic Feedback:</strong>
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
            <div className="topbarRight" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              
              {/* Row 1: Profile stats badges */}
              <div className="topbarStats" aria-label="Decision status" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(108, 92, 231, 0.08)', color: '#6c5ce7', border: '1px solid rgba(108, 92, 231, 0.2)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                  🎯 {admissionProfile.journey === 'Entrance result ready' ? 'Entrance Ready' : (admissionProfile.journey === 'Class 12 planning' ? 'Class 12 Planner' : admissionProfile.journey)}
                </span>
                <span style={{ background: 'rgba(52, 152, 219, 0.08)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.2)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                  ⚡ {admissionProfile.exam || 'JEE Main'}: {admissionProfile.score} ({admissionProfile.scoreType || 'Rank'})
                </span>
                <span style={{ background: 'rgba(46, 204, 113, 0.08)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.2)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                  📁 {shortlisted.length} Saved
                </span>
                <span style={{ background: 'rgba(230, 126, 34, 0.08)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.2)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                  🏆 Leader: {finalCollege.score}% Fit
                </span>
              </div>

              {/* Row 2: Action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAboutModal(true)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    borderColor: '#6c5ce7', 
                    color: '#6c5ce7', 
                    background: 'rgba(108, 92, 231, 0.05)', 
                    fontWeight: 'bold',
                    border: '1px solid rgba(108, 92, 231, 0.25)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  <Info size={14} /> About CollegeVault
                </button>
                <button 
                  className="logoutButton light" 
                  type="button" 
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)', fontWeight: 'bold', padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                >
                  <FileText size={14} /> Export Report
                </button>
                <button 
                  type="button" 
                  className="themeToggle" 
                  onClick={toggleTheme} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', color: 'var(--text-primary)' }}
                  aria-label="Toggle dark mode"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button 
                  className="logoutButton light" 
                  type="button" 
                  onClick={handleLogout}
                  style={{ padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  Logout
                </button>
              </div>

            </div>
          </header>

          {activeSection === 'dashboard' && (
            <>
              <section className="analyticsStrip" id="analytics" style={{ animation: 'fadeIn 0.3s ease' }}>
                <Metric icon={<Timer size={18} />} label={isClass12Planner ? 'Planning Mode' : 'Vault Status'} value={isClass12Planner ? 'Early' : (predictingAdmission ? 'Running' : (mlLastRunAt ? 'Ready' : 'Needs Rank'))} />
                <Metric icon={<Building2 size={18} />} label="Compared" value={String(shortlisted.length)} />
                <Metric icon={<Target size={18} />} label="Vault Matches" value={String(mlMatchedShortlistCount)} />
                <Metric icon={<Star size={18} />} label={isClass12Planner ? 'Best Fit' : 'Best Vault Signal'} value={isClass12Planner ? `${finalCollege.shortName || 'College'} ${finalCollege.score}%` : (bestMlCollege ? `${bestMlCollege.shortName} (${getShortBranch(bestMlCollege.branch)}) ${bestMlCollege.score}%` : 'Pending')} />
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px', width: '100%', animation: 'fadeIn 0.3s ease', marginBottom: '24px' }}>
                
                {/* Panel 1: Your Academic & Priority Profile */}
                <article className="panel decisionTrail" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c5ce7', fontWeight: 'bold' }}>
                      📋 Decision Context
                    </span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>Your Target Profile & Leader</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Profile Items */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                        <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Journey Route</small>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>{admissionProfile.journey || 'Not selected'}</strong>
                      </div>
                      <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                        <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Exam & Score</small>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {admissionProfile.exam || 'JEE Main'}: {admissionProfile.score || 'N/A'} ({admissionProfile.scoreType || 'Rank'})
                        </strong>
                      </div>
                      <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                        <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Seat Category</small>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>{admissionProfile.category || 'General'}</strong>
                      </div>
                      <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                        <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Branch Focus</small>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>{admissionProfile.preferredBranches || 'All Branches'}</strong>
                      </div>
                    </div>

                    {/* Leader Highlight */}
                    <div style={{ marginTop: '4px', background: 'rgba(39, 174, 96, 0.08)', border: '1px solid rgba(39, 174, 96, 0.2)', padding: '14px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.72rem', color: '#27ae60', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🏆 Top Match Leader
                      </span>
                      <h4 style={{ margin: '4px 0 2px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>{finalCollege.name}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Recommended because it fits **{finalCollege.score}%** of your priorities (fees, placement packages, location, and campus life).
                      </p>
                    </div>
                  </div>
                </article>

                {/* Panel 2: Research Checklist */}
                <article className="panel reviewQueue" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#e67e22', fontWeight: 'bold' }}>
                      ⚡ Action Required
                    </span>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>Next Research Steps</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { text: `Verify branch-wise placement reports for ${finalCollege.shortName}`, desc: 'Check actual average vs. median package distributions.' },
                      { text: 'Connect with a senior regarding hostels and coding culture', desc: 'Ask about college life, mess quality, and competitive coding environment.' },
                      { text: 'Compare four-year tuition fees with family budget', desc: 'Verify the financial plan to avoid surprises later.' },
                      { text: 'Record final reason in Reflection before locking', desc: 'Log your justification to secure your admission path.' }
                    ].map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'grid', placeItems: 'center', width: '20px', height: '20px', background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', borderRadius: '50%', fontSize: '0.72rem', fontWeight: 'bold', flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.82rem', display: 'block', color: 'var(--text-primary)' }}>{item.text}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

              </div>

              <article className="panel" style={{ width: '100%', animation: 'fadeIn 0.3s ease', marginBottom: '20px' }}>
                <div className="panelHeader">
                  <div>
                    <p className="eyebrow">{isClass12Planner ? 'Early planner guidance' : 'Automatic College Vault guidance'}</p>
                    <h3>{isClass12Planner ? 'Explore before entrance results' : 'Admission signal from your saved rank'}</h3>
                  </div>
                  <span className="quietBadge">
                    {isClass12Planner ? 'Rank can be added later' : (mlLastRunAt ? `Updated ${mlLastRunAt}` : 'Waiting for rank')}
                  </span>
                </div>

                {isClass12Planner ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '18px' }}>
                    <div className="notesBlock" style={{ padding: '14px' }}>
                      <strong>Current planning profile</strong>
                      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                        {admissionProfile.stream || 'Class 12'} / Board score {admissionProfile.score || 'not added'} / {admissionProfile.category}
                      </p>
                    </div>
                    <div className="notesBlock" style={{ padding: '14px' }}>
                      <strong>Next unlock</strong>
                      <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
                        Add entrance rank later in Onboarding to switch on dataset cutoff predictions.
                      </p>
                    </div>
                  </div>
                ) : predictingAdmission ? (
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
      
      {/* Hidden A4 Print Report Container */}
      <div id="print-report" style={{ display: 'none' }}>
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff', textAlign: 'left' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #6c5ce7', paddingBottom: '20px', marginBottom: '30px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#6c5ce7', fontWeight: '800', letterSpacing: '-0.02em' }}>DECISIONVAULT</h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Counseling & Decision Matrix Report</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold' }}>Date: {new Date().toLocaleDateString('en-IN')}</p>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#666' }}>Report ID: DV-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
            </div>
          </div>

          {/* Student Profile & Context */}
          <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#333', borderBottom: '1px solid #dee2e6', paddingBottom: '6px' }}>Student Profile Context</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
              <div><strong>Target Journey:</strong> {admissionProfile.journey}</div>
              <div><strong>Entrance Exam:</strong> {admissionProfile.exam}</div>
              <div><strong>Category Rank/Score:</strong> {admissionProfile.score} ({admissionProfile.scoreType})</div>
              <div><strong>Counselling Seat Category:</strong> {admissionProfile.category}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Preferred Branches:</strong> {admissionProfile.preferredBranches || 'All Branches'}</div>
            </div>
          </div>

          {/* Shortlisted Leaderboard */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#333', borderBottom: '1px solid #dee2e6', paddingBottom: '6px' }}>Vault Shortlist & Blended Fit Scores</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f1f3f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Rank</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Institute & Branch</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Blended Fit Score</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Admission Likelihood</th>
                </tr>
              </thead>
              <tbody>
                {vaultColleges.map((college, idx) => (
                  <tr key={college.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>#{idx + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 'bold' }}>{college.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{college.branch} &bull; {college.city}, {college.state}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#6c5ce7' }}>{college.score}%</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: college.mlAdmissionStatus?.className === 'eligible' ? '#27ae60' : '#e67e22' }}>
                      {college.mlAdmission?.probability ? `${college.mlAdmission.probability}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Priorities Slider Weights */}
          <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#333', borderBottom: '1px solid #dee2e6', paddingBottom: '6px' }}>Decision Priorities & Weights</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: '0.8rem' }}>
              {priorities.map((p) => (
                <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #dee2e6', paddingBottom: '4px' }}>
                  <span style={{ color: '#555' }}>{p.label}</span>
                  <strong style={{ color: '#333' }}>Weight: {p.weight}/5</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Action checklist */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#333', borderBottom: '1px solid #dee2e6', paddingBottom: '6px' }}>Pending Research Checklist</h2>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', lineHeight: '1.6' }}>
              <li>Verify branch-wise placement reports for {finalCollege.shortName} (check average vs. median distributions).</li>
              <li>Connect with a senior regarding hostels, mess, and coding culture.</li>
              <li>Compare four-year tuition fees with family budget constraints.</li>
              <li>Record final reason in Reflection before locking admission path.</li>
            </ul>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '15px', marginTop: '40px', textAlign: 'center', fontSize: '0.75rem', color: '#888' }}>
            Report generated automatically by DecisionVault. All cutoff ranks are mathematically modeled based on historical JoSAA/CSAB datasets (2018-2025).
          </div>
          
        </div>
      </div>

      {/* Glassmorphic About Project Modal */}
      {showAboutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '600px',
            maxWidth: '90%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '30px',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
            color: 'var(--text-primary)',
            textAlign: 'left'
          }}>
            <button 
              onClick={() => setShowAboutModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ background: '#6c5ce7', color: '#fff', borderRadius: '8px', padding: '6px', display: 'flex' }}>
                <GraduationCap size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem' }}>About DecisionVault</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Decision-Support System</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.86rem', lineHeight: '1.5' }}>
              <p>
                <strong>DecisionVault</strong> is an intelligent counseling portal designed to assist engineering students in navigating the complex admissions process. It acts as an analytical, evidence-based partner to remove emotional bias and ensure a rational decision.
              </p>

              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#6c5ce7' }}>🚀 Key Features & Modules</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                    <strong>🔮 Cutoff Estimation Model</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Powered by a JoSAA/CSAB historical dataset containing **432,000+ cutoff records (2018–2025)** to calculate your category rank probability in real-time.
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                    <strong>⚖️ Priority Decision Matrix</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Drag sliders to weight factors like Placements, Tuition Budget, Campus Ratings, and Distance to see which options offer the highest blended fit.
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                    <strong>💬 Google Gemini Counselor Q&A</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      An integrated, context-aware AI chatbot that pulls detailed specs, packages, hostel reviews, and links to guide you through qualitative research.
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                    <strong>📄 Printable PDF Export</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Instantly compile your dashboard, priorities list, and research checklists into a professional A4 PDF printout to share with family members.
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(39, 174, 96, 0.08)', border: '1px solid rgba(39, 174, 96, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <strong>💡 How to use the platform:</strong> Shortlist colleges from <strong>Discovery</strong>, weigh your sliders in the <strong>Matrix</strong>, research campus details with the <strong>Gemini Chatbot</strong>, and print your summary!
              </div>
            </div>

            <button 
              onClick={() => setShowAboutModal(false)}
              className="primaryAction"
              style={{ width: '100%', marginTop: '20px', minHeight: '38px' }}
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
