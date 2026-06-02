import { LandingPage } from './components/LandingPage'
import { SignPdfApp } from './SignPdfApp'
import './LandingPage.css'

export default function App() {
  const scrollToApp = () => {
    document.getElementById('sign')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <LandingPage onStart={scrollToApp} />
      <section id="sign" className="app-section" aria-label="PDF signing tool">
        <SignPdfApp />
      </section>
    </>
  )
}
