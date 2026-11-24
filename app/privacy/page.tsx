// Template privacy policy (roadmap #20), written to match what A3RO actually collects today.
// Update it whenever data collection changes (e.g. #31 analytics, #46 interaction events, #27 accounts).
import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Privacy — A3RO Intelligence", description: "What personal information A3RO collects and how it is used." };

export default function PrivacyPage() {
  return <LegalPage kicker="Legal" title="Privacy policy" updated="24 November 2026">
    <p>This policy explains what personal information A3RO collects through a3ro.com.au and the A3RO newsletter, and how we handle it. We aim to follow the Australian Privacy Principles in the Privacy Act 1988 (Cth).</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Email address and message</strong> when you send an enquiry or request access through a form on the site, along with the page you sent it from.</li>
      <li><strong>Email address</strong> when you subscribe to the newsletter.</li>
      <li><strong>Account details</strong> if you create an A3RO account: your email address, when you signed up and last signed in, whether your account has Premium and, if you sign in with Google, your name and email as provided by Google. A sign-in cookie keeps you logged in.</li>
      <li><strong>Anonymous usage events</strong>: which pages are viewed, which outside sites are clicked through to, what is typed into site search, which assets are opened and which forms are submitted. These events carry no name, email address, IP address or account, and can&rsquo;t be linked to you. We also use Vercel Web Analytics, which counts page views without cookies.</li>
      <li><strong>Technical information</strong> such as error reports from our servers. These record what failed (for example a data source timing out), not who was using the site.</li>
    </ul>
    <p>You can use the public parts of A3RO without giving us any personal information. We don&rsquo;t collect sensitive information.</p>

    <h2>How we use it</h2>
    <ul>
      <li>To reply to your enquiry or access request.</li>
      <li>To send the newsletter you signed up for. Every issue has an unsubscribe link.</li>
      <li>To let account holders sign in, to give Premium accounts access to Premium modules, and to keep the service secure and working.</li>
      <li>To see, in aggregate, which parts of A3RO are used, so we know what to improve.</li>
    </ul>
    <p>We don&rsquo;t sell your personal information, and we don&rsquo;t use it for advertising.</p>

    <h2>Who we share it with</h2>
    <p>We use service providers to run A3RO: Vercel (website hosting), Supabase (database and sign-in) and Loops (newsletter email). They store and process information on our behalf, and some of them do so outside Australia, including in the United States. We may also disclose information where the law requires it.</p>

    <h2>Cookies</h2>
    <p>A3RO uses a cookie only to keep account holders signed in. If you don&rsquo;t sign in, no sign-in cookie is set.</p>

    <h2>Keeping it secure</h2>
    <p>Personal information is stored with our service providers using access controls and encryption in transit. Only people who run A3RO can access it, and only to operate the service.</p>

    <h2>Access, correction and complaints</h2>
    <p>You can ask to see, correct or delete the personal information we hold about you (including closing your account), or unsubscribe at any time, by emailing <a href="mailto:a3ro.helpdesk@gmail.com">a3ro.helpdesk@gmail.com</a>. If you have a privacy complaint, email us first and we&rsquo;ll respond within 30 days. If you&rsquo;re not satisfied, you can contact the Office of the Australian Information Commissioner at <a href="https://www.oaic.gov.au">oaic.gov.au</a>.</p>

    <h2>Changes</h2>
    <p>We&rsquo;ll update this policy when what we collect changes. The date at the top shows when it last changed.</p>
  </LegalPage>;
}
