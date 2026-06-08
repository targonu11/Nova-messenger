import React, { useEffect, useRef } from 'react';

import { getProfileLevelInfo } from './profileXp';

import { burstNovaConfetti } from './NovaConfetti';

import { showNovaToastCelebrate } from './NovaToast';



export function ProfileLevelBadge({ user, lang = 'ru', compact = false, celebrateOnLevelUp = false }) {

  const info = getProfileLevelInfo(user, lang);

  const isSigma = info.level >= info.maxLevel;

  const isHigh = info.level >= 5;

  const prevLevelRef = useRef(info.level);

  const [levelUpFlash, setLevelUpFlash] = React.useState(false);



  useEffect(() => {

    if (!celebrateOnLevelUp || !user?.id) return;

    const prev = prevLevelRef.current;

    if (info.level > prev && prev > 0) {

      setLevelUpFlash(true);

      burstNovaConfetti({ count: 28, spread: 120 });

      showNovaToastCelebrate(`LVL ${info.level}! ${info.title}`);

      const t = setTimeout(() => setLevelUpFlash(false), 700);

      prevLevelRef.current = info.level;

      return () => clearTimeout(t);

    }

    prevLevelRef.current = info.level;

  }, [info.level, info.title, celebrateOnLevelUp, user?.id]);



  return (

    <span

      className={`nova-level-badge${isSigma ? ' nova-level-badge--sigma' : isHigh ? ' nova-level-badge--high' : ''}${levelUpFlash ? ' nova-level-badge--level-up' : ''}`}

      title={`${info.title} · LVL ${info.level}`}

    >

      {compact ? `LVL ${info.level}` : `${info.title} · ${info.level}`}

    </span>

  );

}



export function ProfileXpBar({ user, lang = 'ru', extraRight = null }) {

  const info = getProfileLevelInfo(user, lang);

  return (

    <div className="nova-xp-bar">

      <div className="nova-xp-bar-track">

        <div className="nova-xp-bar-fill" style={{ width: `${info.progress}%` }} />

      </div>

      <div className="nova-xp-bar-label">

        <span>{info.xp} XP</span>

        {extraRight && <span>{extraRight}</span>}

      </div>

    </div>

  );

}



/** Компактный блок уровня в шапке профиля — одна полоска, без дублей */

export function ProfileHeroStats({ user, lang = 'ru', profileCompleteness = null, completenessLabel = 'Заполненность', celebrateOnLevelUp = false }) {

  const info = getProfileLevelInfo(user, lang);

  const isSigma = info.level >= info.maxLevel;

  const isHigh = info.level >= 5;

  const showCompleteness = profileCompleteness != null && profileCompleteness < 100;

  const prevLevelRef = useRef(info.level);

  const [levelUpFlash, setLevelUpFlash] = React.useState(false);



  useEffect(() => {

    if (!celebrateOnLevelUp || !user?.id) return;

    const prev = prevLevelRef.current;

    if (info.level > prev && prev > 0) {

      setLevelUpFlash(true);

      const t = setTimeout(() => setLevelUpFlash(false), 700);

      prevLevelRef.current = info.level;

      return () => clearTimeout(t);

    }

    prevLevelRef.current = info.level;

  }, [info.level, celebrateOnLevelUp, user?.id]);



  return (

    <div className="profile-hero-stats">

      <span

        className={`nova-level-badge${isSigma ? ' nova-level-badge--sigma' : isHigh ? ' nova-level-badge--high' : ''}${levelUpFlash ? ' nova-level-badge--level-up' : ''}`}

      >

        {info.title} · {info.level}

      </span>

      <div className="nova-xp-bar nova-xp-bar--hero">

        <div className="nova-xp-bar-track">

          <div className="nova-xp-bar-fill" style={{ width: `${info.progress}%` }} />

        </div>

        <div className="nova-xp-bar-label">

          <span>{info.xp} XP</span>

          {showCompleteness && (

            <span>{profileCompleteness}% · {completenessLabel}</span>

          )}

        </div>

      </div>

    </div>

  );

}


