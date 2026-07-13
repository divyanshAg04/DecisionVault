import React, { useState } from 'react';
import { GraduationCap, Upload, ShieldAlert, HelpCircle, Search, Check, ChevronDown } from 'lucide-react';
import { INDIAN_STATES, ENGINEERING_BRANCHES, BUDGET_RANGES } from '../data/constants';
import { colleges } from '../data/colleges';

const EXAM_TOOLTIPS = {
  'JEE Main': 'Used for admission into NITs, IIITs, GFTIs and qualification for JEE Advanced.',
  'JEE Advanced': 'Used for admission into IITs (Indian Institutes of Technology).',
  'CUET': 'Common University Entrance Test for admission to Central and State universities.',
  'State CET': 'State-level Common Entrance Test for regional engineering/technical colleges.',
  'Not decided': 'Select if you are still planning your exam strategy.'
};

export function Class12OnboardingScreen({ admissionProfile, updateAdmissionProfile, onBack, onContinue }) {
  const [validationError, setValidationError] = useState('');
  const [homeStateSearch, setHomeStateSearch] = useState('');
  const [homeStateDropdownOpen, setHomeStateDropdownOpen] = useState(false);
  const [prefStateSearch, setPrefStateSearch] = useState('');
  const [prefStateDropdownOpen, setPrefStateDropdownOpen] = useState(false);
  const [prefBranchSearch, setPrefBranchSearch] = useState('');
  const [prefBranchDropdownOpen, setPrefBranchDropdownOpen] = useState(false);

  const selectedStates = admissionProfile.preferredStates
    ? admissionProfile.preferredStates.split(',').map(x => x.trim()).filter(Boolean)
    : [];
  const selectedBranches = admissionProfile.preferredBranches
    ? admissionProfile.preferredBranches.split(',').map(x => x.trim()).filter(Boolean)
    : [];

  const handleStateCheckboxChange = (state, isChecked) => {
    let next;
    if (isChecked) {
      next = [...selectedStates, state];
    } else {
      next = selectedStates.filter(x => x !== state);
    }
    updateAdmissionProfile('preferredStates', next.join(', '));
  };

  const handleBranchCheckboxChange = (branch, isChecked) => {
    let next;
    if (isChecked) {
      next = [...selectedBranches, branch];
    } else {
      next = selectedBranches.filter(x => x !== branch);
    }
    updateAdmissionProfile('preferredBranches', next.join(', '));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = [];
    if (!admissionProfile.stream) missing.push('Stream');
    if (!admissionProfile.score || !admissionProfile.score.trim()) missing.push('Board percentage');
    if (!admissionProfile.targetExam) missing.push('Target exam');
    if (!admissionProfile.category) missing.push('Category');
    if (!admissionProfile.homeState) missing.push('Home state');
    if (selectedBranches.length === 0) missing.push('Preferred branches');
    if (selectedStates.length === 0) missing.push('Preferred college states');

    if (missing.length > 0) {
      setValidationError(`You missed some mandatory fields: ${missing.join(', ')}.`);
      return;
    }

    const scoreNum = parseFloat(admissionProfile.score);
    if (isNaN(scoreNum) || scoreNum > 100) {
      setValidationError('Board percentage cannot be greater than 100.');
      return;
    }
    if (scoreNum < 0) {
      setValidationError('Board percentage cannot be negative.');
      return;
    }

    setValidationError('');
    onContinue();
  };

  return (
    <main className="onboardingShell">
      <section className="onboardingIntro">
        <div className="brandBlock brandButton" style={{ cursor: 'default' }}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </div>

        <div>
          <p className="eyebrow">Class 12 planning</p>
          <h2>Explore colleges before the entrance result arrives.</h2>
          <p>
            Build an early decision workspace with board performance, stream, interests, budget, state preference, and
            target exams. You can update it later with rank or scorecard data.
          </p>
        </div>

        <div className="intakeSteps">
          <span>1. Add board and stream details</span>
          <span>2. Pick interests, budget, and target exams</span>
          <span>3. Start an early college shortlist</span>
        </div>
      </section>

      <section className="intakePanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Planning profile</p>
            <h3>Student details</h3>
          </div>
          <button className="textButton inline" type="button" onClick={onBack}>
            Change path
          </button>
        </div>

        {validationError && (
          <div style={{
            margin: '0 18px 16px',
            padding: '12px 16px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: '8px',
            color: '#ff4d4f',
            fontSize: '0.88rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} />
            <span>{validationError}</span>
          </div>
        )}

        <div className="intakeGrid" style={{ padding: '0 18px 18px' }}>
          <label>
            Stream <span style={{ color: '#ff4d4f' }}>*</span>
            <select value={admissionProfile.stream || 'PCM'} onChange={(event) => updateAdmissionProfile('stream', event.target.value)}>
              <option>PCM</option>
              <option>PCB</option>
              <option>Commerce</option>
              <option>Humanities</option>
            </select>
          </label>

          <label>
            Board percentage <span style={{ color: '#ff4d4f' }}>*</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              value={admissionProfile.score}
              onChange={(event) => {
                const val = event.target.value;
                if (val === '' || (Number(val) >= 0 && Number(val) <= 100)) {
                  updateAdmissionProfile('score', val);
                }
              }}
              placeholder="Example: 86"
              type="number"
              min="0"
              max="100"
              step="0.01"
              style={{ width: '100%', paddingRight: '32px' }}
            />
              <span style={{ position: 'absolute', right: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>%</span>
            </div>
          </label>

          <label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Target Exam <span style={{ color: '#ff4d4f' }}>*</span>
              <div className="premium-tooltip-container">
                <HelpCircle size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="premium-tooltip-text">
                  {EXAM_TOOLTIPS[admissionProfile.targetExam || 'JEE Main'] || 'Target entrance exam selection.'}
                </span>
              </div>
            </div>
            <select
              value={admissionProfile.targetExam || 'JEE Main'}
              onChange={(event) => {
                updateAdmissionProfile('targetExam', event.target.value);
                updateAdmissionProfile('exam', event.target.value);
              }}
            >
              <option>JEE Main</option>
              <option>CUET</option>
              <option>State CET</option>
              <option>Not decided</option>
            </select>
          </label>

          <label>
            Category <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.category}
              onChange={(event) => updateAdmissionProfile('category', event.target.value)}
            >
              <option>General</option>
              <option>OBC-NCL</option>
              <option>EWS</option>
              <option>SC</option>
              <option>ST</option>
              <option>PwD</option>
            </select>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Home State <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div
              onClick={() => setHomeStateDropdownOpen(!homeStateDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                color: admissionProfile.homeState ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.88rem',
                cursor: 'pointer',
                minHeight: '41px'
              }}
            >
              <span>{admissionProfile.homeState || 'Search State...'}</span>
              <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>

            {homeStateDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 1000,
                  width: '100%',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  marginTop: '4px',
                  padding: '8px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '6px' }}>
                  <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search State..."
                    value={homeStateSearch}
                    onChange={(e) => setHomeStateSearch(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.84rem', padding: '4px', color: 'var(--text-primary)' }}
                  />
                </div>
                {INDIAN_STATES.filter(state => state.toLowerCase().includes(homeStateSearch.toLowerCase())).map(state => (
                  <div
                    key={state}
                    onClick={() => {
                      updateAdmissionProfile('homeState', state);
                      setHomeStateDropdownOpen(false);
                      setHomeStateSearch('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      background: admissionProfile.homeState === state ? 'rgba(108, 92, 231, 0.08)' : 'transparent',
                      color: admissionProfile.homeState === state ? '#6c5ce7' : 'var(--text-primary)',
                      fontWeight: admissionProfile.homeState === state ? 'bold' : 'normal'
                    }}
                    className="dropdownItem"
                  >
                    <span>{state}</span>
                    {admissionProfile.homeState === state && <Check size={14} style={{ color: '#6c5ce7' }} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <label>
            Budget range <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.budget}
              onChange={(event) => updateAdmissionProfile('budget', event.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select Budget --</option>
              {BUDGET_RANGES.map(range => (
                <option key={range} value={range}>{range}</option>
              ))}
            </select>
          </label>

          <div className="wideField" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Preferred college states (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              minHeight: '41px',
              padding: '6px 10px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              alignItems: 'center'
            }}>
              {selectedStates.map(state => (
                <div key={state} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(108, 92, 231, 0.08)', border: '1px solid rgba(108, 92, 231, 0.3)', color: '#6c5ce7', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {state}
                  <button type="button" onClick={() => handleStateCheckboxChange(state, false)} style={{ background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', padding: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', marginLeft: '2px' }}>
                    ✕
                  </button>
                </div>
              ))}
              
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={() => setPrefStateDropdownOpen(!prefStateDropdownOpen)}
                  style={{ background: 'none', border: '1px dashed var(--border-color)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  + Add State
                </button>
                {prefStateDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, width: '200px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '4px', padding: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '6px' }}>
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Search state..."
                        value={prefStateSearch}
                        onChange={(e) => setPrefStateSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', padding: '2px', color: 'var(--text-primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {INDIAN_STATES.filter(state => !selectedStates.includes(state) && state.toLowerCase().includes(prefStateSearch.toLowerCase())).map(state => (
                      <div
                        key={state}
                        onClick={() => {
                          handleStateCheckboxChange(state, true);
                          setPrefStateSearch('');
                          setPrefStateDropdownOpen(false);
                        }}
                        style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}
                        className="dropdownItem"
                      >
                        {state}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="wideField" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Preferred branches (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              minHeight: '41px',
              padding: '6px 10px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              alignItems: 'center'
            }}>
              {selectedBranches.map(branch => (
                <div key={branch} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(108, 92, 231, 0.08)', border: '1px solid rgba(108, 92, 231, 0.3)', color: '#6c5ce7', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {branch}
                  <button type="button" onClick={() => handleBranchCheckboxChange(branch, false)} style={{ background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', padding: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', marginLeft: '2px' }}>
                    ✕
                  </button>
                </div>
              ))}
              
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={() => setPrefBranchDropdownOpen(!prefBranchDropdownOpen)}
                  style={{ background: 'none', border: '1px dashed var(--border-color)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  + Add Branch
                </button>
                {prefBranchDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, width: '220px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '4px', padding: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '6px' }}>
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Search branch..."
                        value={prefBranchSearch}
                        onChange={(e) => setPrefBranchSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', padding: '2px', color: 'var(--text-primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {ENGINEERING_BRANCHES.filter(branch => !selectedBranches.includes(branch) && branch.toLowerCase().includes(prefBranchSearch.toLowerCase())).map(branch => (
                      <div
                        key={branch}
                        onClick={() => {
                          handleBranchCheckboxChange(branch, true);
                          setPrefBranchSearch('');
                          setPrefBranchDropdownOpen(false);
                        }}
                        style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}
                        className="dropdownItem"
                      >
                        {branch}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          <button className="primaryAction" type="button" onClick={handleSubmit} style={{ width: '100%', margin: 0 }}>
            Open planning dashboard
          </button>
        </div>
      </section>
    </main>
  );
}

export function OnboardingScreen({ admissionProfile, updateAdmissionProfile, onBack, onContinue, onFileUpload }) {
  const [validationError, setValidationError] = useState('');
  const [homeStateSearch, setHomeStateSearch] = useState('');
  const [homeStateDropdownOpen, setHomeStateDropdownOpen] = useState(false);
  const [prefStateSearch, setPrefStateSearch] = useState('');
  const [prefStateDropdownOpen, setPrefStateDropdownOpen] = useState(false);
  const [prefBranchSearch, setPrefBranchSearch] = useState('');
  const [prefBranchDropdownOpen, setPrefBranchDropdownOpen] = useState(false);

  const selectedStates = admissionProfile.preferredStates
    ? admissionProfile.preferredStates.split(',').map(x => x.trim()).filter(Boolean)
    : [];
  const selectedBranches = admissionProfile.preferredBranches
    ? admissionProfile.preferredBranches.split(',').map(x => x.trim()).filter(Boolean)
    : [];

  const handleStateCheckboxChange = (state, isChecked) => {
    let next;
    if (isChecked) {
      next = [...selectedStates, state];
    } else {
      next = selectedStates.filter(x => x !== state);
    }
    updateAdmissionProfile('preferredStates', next.join(', '));
  };

  const handleBranchCheckboxChange = (branch, isChecked) => {
    let next;
    if (isChecked) {
      next = [...selectedBranches, branch];
    } else {
      next = selectedBranches.filter(x => x !== branch);
    }
    updateAdmissionProfile('preferredBranches', next.join(', '));
  };

  const getEstimatedEligibleColleges = () => {
    const scoreVal = parseFloat(admissionProfile.score);
    if (isNaN(scoreVal) || scoreVal <= 0) return [];

    const type = admissionProfile.scoreType || 'Rank';
    let targetRank = 999999;

    if (type === 'Rank') {
      targetRank = scoreVal;
    } else if (type === 'Percentile') {
      targetRank = Math.round((100 - scoreVal) * 12000);
    } else if (type === 'Score') {
      const estimatedPercentile = Math.min(100, Math.max(0, (scoreVal / 300) * 100));
      targetRank = Math.round((100 - estimatedPercentile) * 12000);
    }

    const eligible = colleges
      .filter(c => {
        if (targetRank <= 15000) {
          return ['IIT Delhi', 'IIT Roorkee', 'IIIT Hyderabad', 'NIT Trichy', 'IIT Madras', 'IIT Kanpur'].includes(c.shortName || c.name);
        }
        if (targetRank <= 40000) {
          return ['NIT Surathkal', 'NIT Warangal', 'MNNIT', 'IIIT Bangalore', 'BITS Goa', 'COEP'].includes(c.shortName || c.name);
        }
        return ['VIT', 'TIET', 'BIT Mesra', 'VJTI', 'COEP', 'Jadavpur University'].includes(c.shortName || c.name);
      })
      .slice(0, 4);

    return eligible;
  };

  const getScoreLabel = () => {
    const type = admissionProfile.scoreType || 'Rank';
    if (type === 'Percentile') return 'Enter Percentile';
    if (type === 'Score') return 'Enter Raw Score';
    return 'Enter CRL Rank';
  };

  const getScorePlaceholder = () => {
    const type = admissionProfile.scoreType || 'Rank';
    if (type === 'Percentile') return 'e.g. 98.73';
    if (type === 'Score') return 'e.g. 180';
    return 'e.g. 8900';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = [];
    if (!admissionProfile.exam) missing.push('Exam');
    if (!admissionProfile.scoreType) missing.push('Score type');
    if (!admissionProfile.score || !admissionProfile.score.trim()) missing.push('Rank / score');
    if (!admissionProfile.category) missing.push('Category');
    if (!admissionProfile.homeState) missing.push('Home state');
    if (selectedBranches.length === 0) missing.push('Preferred branches');
    if (selectedStates.length === 0) missing.push('Preferred college states');

    if (missing.length > 0) {
      setValidationError(`You missed some mandatory fields: ${missing.join(', ')}.`);
      return;
    }
    setValidationError('');
    onContinue();
  };

  return (
    <main className="onboardingShell">
      <section className="onboardingIntro">
        <div className="brandBlock brandButton" style={{ cursor: 'default' }}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </div>

        <div>
          <p className="eyebrow">Admission profile</p>
          <h2>Build a workspace around your exam result.</h2>
          <p>
            Add your scorecard details, category, home state, and preferred branches. CollegeVault uses this profile to
            organize your shortlist, comparison matrix, research, and final decision.
          </p>
        </div>

        <div className="intakeSteps">
          <span>1. Upload scorecard or enter rank</span>
          <span>2. Select category, state, and branches</span>
          <span>3. Open personalized dashboard</span>
        </div>
      </section>

      <section className="intakePanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Admission profile</p>
            <h3>Candidate details</h3>
          </div>
          <button className="textButton inline" type="button" onClick={onBack}>
            Change path
          </button>
        </div>

        {validationError && (
          <div style={{
            margin: '0 18px 16px',
            padding: '12px 16px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: '8px',
            color: '#ff4d4f',
            fontSize: '0.88rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} />
            <span>{validationError}</span>
          </div>
        )}

        <label className="uploadBox">
          <Upload size={22} />
          <span>
            <strong>{admissionProfile.fileName || 'Upload supporting document (Optional)'}</strong>
            <small>PDF, JPG, or PNG. This is optional. Please enter your rank/score details below manually.</small>
          </span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={onFileUpload}
          />
        </label>

        <div className="intakeGrid" style={{ padding: '0 18px 18px' }}>
          <label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Exam <span style={{ color: '#ff4d4f' }}>*</span>
              <div className="premium-tooltip-container">
                <HelpCircle size={14} style={{ color: 'var(--text-secondary)' }} />
                <span className="premium-tooltip-text">
                  {EXAM_TOOLTIPS[admissionProfile.exam || 'JEE Main'] || 'Select your competitive entrance exam.'}
                </span>
              </div>
            </div>
            <select value={admissionProfile.exam || 'JEE Main'} onChange={(event) => updateAdmissionProfile('exam', event.target.value)}>
              <option>JEE Main</option>
              <option>JEE Advanced</option>
              <option>CUET</option>
            </select>
          </label>

          <div className="wideField" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              How would you like to enter your {admissionProfile.exam || 'JEE Main'} result? <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '4px' }}>
              {[
                { value: 'Rank', label: 'Rank (Recommended)' },
                { value: 'Percentile', label: 'Percentile' },
                { value: 'Score', label: 'Raw Score' }
              ].map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="scoreTypeRadio"
                    value={opt.value}
                    checked={(admissionProfile.scoreType || 'Rank') === opt.value}
                    onChange={() => {
                      updateAdmissionProfile('scoreType', opt.value);
                      updateAdmissionProfile('score', '');
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <label>
            {getScoreLabel()} <span style={{ color: '#ff4d4f' }}>*</span>
            <input
              value={admissionProfile.score || ''}
              onChange={(event) => {
                const val = event.target.value;
                const type = admissionProfile.scoreType || 'Rank';
                if (type === 'Percentile') {
                  if (val === '' || (Number(val) >= 0 && Number(val) <= 100)) {
                    updateAdmissionProfile('score', val);
                  }
                } else {
                  updateAdmissionProfile('score', val);
                }
              }}
              placeholder={getScorePlaceholder()}
              type={admissionProfile.scoreType === 'Percentile' || admissionProfile.scoreType === 'Score' ? 'number' : 'text'}
              min="0"
              max={admissionProfile.scoreType === 'Percentile' ? "100" : undefined}
              step="any"
            />
          </label>

          {getEstimatedEligibleColleges().length > 0 && (
            <div style={{
              gridColumn: '1 / -1',
              marginTop: '10px',
              padding: '12px 16px',
              background: 'rgba(31, 138, 76, 0.05)',
              border: '1px dashed rgba(31, 138, 76, 0.3)',
              borderRadius: '8px',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#1f8a4c', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                🎯 Estimated Eligible Colleges
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                {getEstimatedEligibleColleges().map(c => (
                  <div key={c.id || c.name} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#1f8a4c', fontWeight: 'bold' }}>✓</span> {c.name} ({c.shortName})
                  </div>
                ))}
              </div>
            </div>
          )}

          <label>
            Category <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.category}
              onChange={(event) => updateAdmissionProfile('category', event.target.value)}
            >
              <option>General</option>
              <option>OBC-NCL</option>
              <option>EWS</option>
              <option>SC</option>
              <option>ST</option>
              <option>PwD</option>
            </select>
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Home State <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div
              onClick={() => setHomeStateDropdownOpen(!homeStateDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                color: admissionProfile.homeState ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.88rem',
                cursor: 'pointer',
                minHeight: '41px'
              }}
            >
              <span>{admissionProfile.homeState || 'Search State...'}</span>
              <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>

            {homeStateDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 1000,
                  width: '100%',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  marginTop: '4px',
                  padding: '8px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '6px' }}>
                  <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search State..."
                    value={homeStateSearch}
                    onChange={(e) => setHomeStateSearch(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.84rem', padding: '4px', color: 'var(--text-primary)' }}
                  />
                </div>
                {INDIAN_STATES.filter(state => state.toLowerCase().includes(homeStateSearch.toLowerCase())).map(state => (
                  <div
                    key={state}
                    onClick={() => {
                      updateAdmissionProfile('homeState', state);
                      setHomeStateDropdownOpen(false);
                      setHomeStateSearch('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      background: admissionProfile.homeState === state ? 'rgba(108, 92, 231, 0.08)' : 'transparent',
                      color: admissionProfile.homeState === state ? '#6c5ce7' : 'var(--text-primary)',
                      fontWeight: admissionProfile.homeState === state ? 'bold' : 'normal'
                    }}
                    className="dropdownItem"
                  >
                    <span>{state}</span>
                    {admissionProfile.homeState === state && <Check size={14} style={{ color: '#6c5ce7' }} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ minHeight: '1px' }}></div> {/* Grid Spacer */}

          <div className="wideField" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Preferred college states (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              minHeight: '41px',
              padding: '6px 10px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              alignItems: 'center'
            }}>
              {selectedStates.map(state => (
                <div key={state} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(108, 92, 231, 0.08)', border: '1px solid rgba(108, 92, 231, 0.3)', color: '#6c5ce7', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {state}
                  <button type="button" onClick={() => handleStateCheckboxChange(state, false)} style={{ background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', padding: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', marginLeft: '2px' }}>
                    ✕
                  </button>
                </div>
              ))}
              
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={() => setPrefStateDropdownOpen(!prefStateDropdownOpen)}
                  style={{ background: 'none', border: '1px dashed var(--border-color)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  + Add State
                </button>
                {prefStateDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, width: '200px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '4px', padding: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '6px' }}>
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Search state..."
                        value={prefStateSearch}
                        onChange={(e) => setPrefStateSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', padding: '2px', color: 'var(--text-primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {INDIAN_STATES.filter(state => !selectedStates.includes(state) && state.toLowerCase().includes(prefStateSearch.toLowerCase())).map(state => (
                      <div
                        key={state}
                        onClick={() => {
                          handleStateCheckboxChange(state, true);
                          setPrefStateSearch('');
                          setPrefStateDropdownOpen(false);
                        }}
                        style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}
                        className="dropdownItem"
                      >
                        {state}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="wideField" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Preferred branches (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              minHeight: '41px',
              padding: '6px 10px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--bg-card)',
              alignItems: 'center'
            }}>
              {selectedBranches.map(branch => (
                <div key={branch} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(108, 92, 231, 0.08)', border: '1px solid rgba(108, 92, 231, 0.3)', color: '#6c5ce7', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {branch}
                  <button type="button" onClick={() => handleBranchCheckboxChange(branch, false)} style={{ background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', padding: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', marginLeft: '2px' }}>
                    ✕
                  </button>
                </div>
              ))}
              
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={() => setPrefBranchDropdownOpen(!prefBranchDropdownOpen)}
                  style={{ background: 'none', border: '1px dashed var(--border-color)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  + Add Branch
                </button>
                {prefBranchDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, width: '220px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: '4px', padding: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '6px' }}>
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Search branch..."
                        value={prefBranchSearch}
                        onChange={(e) => setPrefBranchSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', padding: '2px', color: 'var(--text-primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {ENGINEERING_BRANCHES.filter(branch => !selectedBranches.includes(branch) && branch.toLowerCase().includes(prefBranchSearch.toLowerCase())).map(branch => (
                      <div
                        key={branch}
                        onClick={() => {
                          handleBranchCheckboxChange(branch, true);
                          setPrefBranchSearch('');
                          setPrefBranchDropdownOpen(false);
                        }}
                        style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}
                        className="dropdownItem"
                      >
                        {branch}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          <button className="primaryAction" type="button" onClick={handleSubmit} style={{ width: '100%', margin: 0 }}>
            Open decision dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
