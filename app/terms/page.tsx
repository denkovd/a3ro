// Template terms (roadmap #20). To be replaced by lawyer-reviewed terms at the validation gate (#17).
import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";
import { GENERAL_INFO_WARNING } from "../components/SiteFooter";

export const metadata: Metadata = { title: "Terms of use — A3RO Intelligence", description: "Terms for using the A3RO website and newsletter." };

export default function TermsPage() {
  return <LegalPage kicker="Legal" title="Terms of use" updated="23 November 2026">
    <p>These terms apply to the A3RO website at a3ro.com.au and the A3RO newsletter (together, &ldquo;A3RO&rdquo;). By using A3RO you agree to them. If you don&rsquo;t agree, please don&rsquo;t use A3RO.</p>

    <h2>General information only</h2>
    <p>{GENERAL_INFO_WARNING}</p>
    <p>Nothing on A3RO is a recommendation or offer to buy or sell any financial product. Indicators, regimes, scores and signals are descriptions of data, not predictions or instructions.</p>

    <h2>Data and accuracy</h2>
    <p>A3RO is built on data from third parties, including the Australian Bureau of Statistics, the Reserve Bank of Australia, the OECD, the U.S. Energy Information Administration, FRED® (Federal Reserve Bank of St. Louis) and IMF PortWatch. Sources are named on each page. Data can be delayed, revised, incomplete or wrong, and our calculations can contain errors. We show when data was last refreshed where we can, but we don&rsquo;t guarantee that anything on A3RO is accurate, complete or current.</p>
    <p>Australian Bureau of Statistics data is used under the Creative Commons Attribution 4.0 licence. Third-party data remains the property of its owners, and the sources do not endorse A3RO.</p>

    <h2>Using A3RO</h2>
    <ul>
      <li>You may view and share links to A3RO for your own non-commercial use.</li>
      <li>You must not scrape, bulk download, resell or republish A3RO content or data, or use it to build a competing service, without our written permission.</li>
      <li>You must not try to get around access controls, overload the service, or access parts of A3RO you aren&rsquo;t permitted to use.</li>
    </ul>

    <h2>Intellectual property</h2>
    <p>The A3RO name, design, text, analysis and software are owned by A3RO or its licensors. These terms don&rsquo;t give you any rights in them beyond using A3RO as described above.</p>

    <h2>Liability</h2>
    <p>To the extent permitted by law, A3RO is provided &ldquo;as is&rdquo;, and we are not liable for any loss or damage arising from your use of, or reliance on, A3RO, including investment or trading losses. Nothing in these terms excludes rights you have under the Australian Consumer Law that cannot be excluded. Where our liability can be limited but not excluded, it is limited to supplying the service again.</p>

    <h2>Changes and availability</h2>
    <p>We may change, suspend or stop any part of A3RO, and we may update these terms. The date at the top shows when they last changed. Continuing to use A3RO after a change means you accept the updated terms.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of New South Wales, Australia, and you submit to the courts of New South Wales.</p>

    <h2>Contact</h2>
    <p>Questions about these terms: <a href="mailto:a3ro.helpdesk@gmail.com">a3ro.helpdesk@gmail.com</a>. See also our <a href="/privacy">privacy policy</a>.</p>
  </LegalPage>;
}
