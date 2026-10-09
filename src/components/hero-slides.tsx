import { useEffect, useState } from 'react';
import basecamp from '@/assets/expedition/basecamp-night.webp';
import iceCave from '@/assets/expedition/ice-cave.webp';
import fog from '@/assets/expedition/fog-ascent.webp';
import helicopter from '@/assets/expedition/helicopter-night.png';
import summitFlags from '@/assets/expedition/summit-flags.webp';
import summitTeam from '@/assets/expedition/summit-team.webp';

// Apex expedition screenshots. `focus` is the part of the picture to keep in view when it is cropped.
export const SLIDES = [
  { src: summitTeam, caption: 'The team at the summit', focus: '50% 45%' },
  { src: basecamp, caption: 'Basecamp at night', focus: '50% 55%' },
  { src: iceCave, caption: 'Through the ice cave', focus: '50% 35%' },
  { src: fog, caption: 'Pushing on through the fog', focus: '50% 60%' },
  { src: helicopter, caption: 'Night flight over the ridge', focus: '60% 50%' },
  { src: summitFlags, caption: 'Flags on the summit', focus: '50% 45%' },
];
const INTERVAL = 5000;

// Which picture is showing. Advances every five seconds; choosing one by hand restarts the wait.
export function useSlide() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const next = setTimeout(() => setIndex(i => (i + 1) % SLIDES.length), INTERVAL);
    return () => clearTimeout(next);
  }, [index]);
  return { index, show: setIndex };
}

// Faded pictures behind a page header, cross-fading from one to the next.
export function HeroBackdrop({ index }: { index?: number }) {
  const own = useSlide();
  const current = index ?? own.index;
  return <div className="hero-backdrop" aria-hidden="true">{SLIDES.map((slide, i) => <img key={slide.src} src={slide.src} alt="" className={i === current ? 'active' : ''} style={{ objectPosition: slide.focus }} />)}</div>;
}

// The pictures in full colour inside a frame, with a caption and one dot per picture.
export function HeroFrame({ index, onShow }: { index: number; onShow: (i: number) => void }) {
  const slide = SLIDES[index];
  return <figure className="hero-frame">
    <div className="hero-frame-stage">{SLIDES.map((s, i) => <img key={s.src} src={s.src} alt={i === index ? s.caption : ''} aria-hidden={i !== index} className={i === index ? 'active' : ''} style={{ objectPosition: s.focus }} />)}</div>
    <figcaption>
      <span className="hero-frame-caption" key={index}><span className="status-dot" />{slide?.caption}</span>
      <span className="hero-frame-dots">{SLIDES.map((s, i) => <button key={s.src} type="button" className={i === index ? 'active' : ''} aria-label={`Show picture ${i + 1}: ${s.caption}`} aria-current={i === index} onClick={() => onShow(i)} />)}</span>
    </figcaption>
    <span className="hero-frame-progress" key={`p${index}`} />
  </figure>;
}

// Every picture in a grid, for the gallery section.
export function ExpeditionGallery() {
  return <div className="gallery-grid">{SLIDES.map((slide, i) => <figure key={slide.src} className={`gallery-item g${i + 1}`}><img src={slide.src} alt={slide.caption} loading="lazy" style={{ objectPosition: slide.focus }} /><figcaption>{slide.caption}</figcaption></figure>)}</div>;
}
