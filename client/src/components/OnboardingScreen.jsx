import React, { useState } from 'react';
import { GraduationCap, Upload, ShieldAlert } from 'lucide-react';
import { INDIAN_STATES, ENGINEERING_BRANCHES, BUDGET_RANGES } from '../data/constants';

export function Class12OnboardingScreen({ admissionProfile, updateAdmissionProfile, onBack, onContinue }) {
  const [validationError, setValidationError] = useState('');

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
            Target exam <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.targetExam || 'JEE Main'}
              onChange={(event) => {
                updateAdmissionProfile('targetExam', event.target.value);
                updateAdmissionProfile('exam', event.target.value);
              }}
            >
              <option>JEE Main</option>
              <option>CUET</option>
              <option>NEET</option>
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

          <label>
            Home state <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.homeState}
              onChange={(event) => updateAdmissionProfile('homeState', event.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select State --</option>
              {INDIAN_STATES.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>

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

          <label className="wideField">
            Preferred college states (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px',
              height: '130px',
              overflowY: 'auto',
              background: 'var(--bg-app)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {INDIAN_STATES.map(state => (
                <label key={state} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'normal' }}>
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(state)}
                    onChange={(e) => handleStateCheckboxChange(state, e.target.checked)}
                    style={{ width: 'auto', minHeight: '0', cursor: 'pointer' }}
                  />
                  {state}
                </label>
              ))}
            </div>
          </label>

          <label className="wideField">
            Preferred branches (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px',
              height: '130px',
              overflowY: 'auto',
              background: 'var(--bg-app)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {ENGINEERING_BRANCHES.map(branch => (
                <label key={branch} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'normal' }}>
                  <input
                    type="checkbox"
                    checked={selectedBranches.includes(branch)}
                    onChange={(e) => handleBranchCheckboxChange(branch, e.target.checked)}
                    style={{ width: 'auto', minHeight: '0', cursor: 'pointer' }}
                  />
                  {branch}
                </label>
              ))}
            </div>
          </label>
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
            Exam <span style={{ color: '#ff4d4f' }}>*</span>
            <select value={admissionProfile.exam} onChange={(event) => updateAdmissionProfile('exam', event.target.value)}>
              <option>JEE Main</option>
              <option>JEE Advanced</option>
              <option>CUET</option>
              <option>NEET</option>
              <option>GATE</option>
              <option>CAT</option>
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

          <label>
            Home state <span style={{ color: '#ff4d4f' }}>*</span>
            <select
              value={admissionProfile.homeState}
              onChange={(event) => updateAdmissionProfile('homeState', event.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">-- Select State --</option>
              {INDIAN_STATES.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>

          <div style={{ minHeight: '1px' }}></div> {/* Grid Spacer */}

          <label className="wideField">
            Preferred college states (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px',
              height: '130px',
              overflowY: 'auto',
              background: 'var(--bg-app)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {INDIAN_STATES.map(state => (
                <label key={state} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'normal' }}>
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(state)}
                    onChange={(e) => handleStateCheckboxChange(state, e.target.checked)}
                    style={{ width: 'auto', minHeight: '0', cursor: 'pointer' }}
                  />
                  {state}
                </label>
              ))}
            </div>
          </label>

          <label className="wideField">
            Preferred branches (Select more than 1) <span style={{ color: '#ff4d4f' }}>*</span>
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px',
              height: '130px',
              overflowY: 'auto',
              background: 'var(--bg-app)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {ENGINEERING_BRANCHES.map(branch => (
                <label key={branch} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'normal' }}>
                  <input
                    type="checkbox"
                    checked={selectedBranches.includes(branch)}
                    onChange={(e) => handleBranchCheckboxChange(branch, e.target.checked)}
                    style={{ width: 'auto', minHeight: '0', cursor: 'pointer' }}
                  />
                  {branch}
                </label>
              ))}
            </div>
          </label>
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
