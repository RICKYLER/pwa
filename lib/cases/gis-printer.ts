import type { CaseRecord, GeneralIntakeSheetData, CaseFamilyMember } from '@/lib/db/schema';
import { getBarangayName } from '@/lib/mabini-barangays';

/**
 * Print the official 2-Page Mabini MSWDO General Intake Sheet (GIS)
 * matching the municipal physical form standard.
 */
export function printGeneralIntakeSheet(record: CaseRecord) {
  // Remove existing print iframe if any
  const existing = document.getElementById('mswdo-gis-print-iframe');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'mswdo-gis-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const gis: Partial<GeneralIntakeSheetData> = record.intake_sheet || {};
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const barangayName = getBarangayName(record.barangay_id);

  // Client Details Fallback
  const clientName = record.victim_name || '';
  const clientAge = record.victim_age ? String(record.victim_age) : '';
  const clientSex = record.victim_gender === 'M' ? 'Male' : record.victim_gender === 'F' ? 'Female' : (record.victim_gender || '');
  const clientAddress = record.victim_address || (record.purok_sitio ? `${record.purok_sitio}, ${barangayName}, Mabini` : `${barangayName}, Mabini`);
  const clientContact = record.victim_contact || '';

  // Categories
  const category = gis.client_category || 'walk_in';
  const sectors = gis.sectors || [];
  const caseCategoryType = gis.case_category_type || record.case_type || 'vawc';
  const caseCategoryOther = gis.case_category_other || '';

  // Family Members Table (exactly 10 rows matching Image 2)
  const familyMembers: CaseFamilyMember[] = gis.family_members || [];
  const tenRows = Array.from({ length: 10 }, (_, index) => familyMembers[index] || null);

  const familyRowsHtml = tenRows
    .map((member, index) => {
      const rowNum = index + 1;
      if (member) {
        return `
          <tr>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; font-weight: bold; width: 28px;">${rowNum}</td>
            <td style="border: 1px solid #1e293b; padding: 3px 5px; font-weight: 600; text-transform: uppercase;">${member.name || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 40px;">${member.age || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 75px;">${member.civil_status || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 110px;">${member.relationship || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 110px;">${member.educational_attainment || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 85px;">${member.occupation || ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: right; width: 65px;">${member.income ? `₱${member.income}` : ''}</td>
            <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; width: 75px;">${member.birthday || ''}</td>
          </tr>
        `;
      }
      return `
        <tr>
          <td style="border: 1px solid #1e293b; padding: 3px; text-align: center; font-weight: bold; width: 28px; height: 19px;">${rowNum}</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
          <td style="border: 1px solid #1e293b; padding: 3px;">&nbsp;</td>
        </tr>
      `;
    })
    .join('');

  // Expenses
  const expenses = gis.monthly_expenses || {};
  const totalExpenses =
    expenses.total ||
    ((expenses.food || 0) +
      (expenses.water || 0) +
      (expenses.electricity || 0) +
      (expenses.education || 0) +
      (expenses.transportation || 0));

  // Checkbox Helper
  const check = (val: boolean) => (val ? '☑' : '☐');

  const printHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>General Intake Sheet - ${record.case_number} - ${clientName}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-size: 11px;
            line-height: 1.25;
            -webkit-font-smoothing: antialiased;
          }
          .page {
            page-break-after: always;
            position: relative;
            padding-bottom: 10px;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 12px;
          }
          .header-logo {
            width: 54px;
            height: 54px;
            object-fit: contain;
          }
          .header-text {
            text-align: center;
          }
          .header-text h3 {
            margin: 0;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .header-text p {
            margin: 1px 0;
            font-size: 9.5px;
            color: #334155;
          }
          .header-text h1 {
            margin: 4px 0 0 0;
            font-size: 13.5px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            color: #0f172a;
          }
          .doc-title {
            text-align: center;
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin: 10px 0 8px 0;
            color: #0f172a;
          }
          .date-row {
            margin-bottom: 10px;
            font-weight: 700;
            font-size: 11px;
          }
          .underline-val {
            border-bottom: 1px solid #0f172a;
            display: inline-block;
            min-width: 140px;
            padding: 0 4px;
            font-weight: 700;
          }
          .categories-grid {
            display: grid;
            grid-template-columns: 1.1fr 1.1fr 1.8fr;
            gap: 12px;
            margin-bottom: 12px;
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            border-radius: 4px;
            background: #f8fafc;
          }
          .category-group h4 {
            margin: 0 0 4px 0;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            color: #0f172a;
          }
          .checkbox-item {
            font-size: 10px;
            margin: 2.5px 0;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .section-title {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            margin: 10px 0 6px 0;
            color: #0f172a;
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 2px;
          }
          .id-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            row-gap: 4px;
            column-gap: 16px;
            margin-bottom: 10px;
          }
          .field-row {
            display: flex;
            align-items: baseline;
            font-size: 10.5px;
          }
          .field-label {
            font-weight: 700;
            color: #334155;
            white-space: nowrap;
          }
          .field-line {
            border-bottom: 1px solid #0f172a;
            flex: 1;
            padding-left: 4px;
            font-weight: 700;
            color: #0f172a;
          }
          .family-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 9.5px;
          }
          .family-table th {
            border: 1px solid #0f172a;
            background-color: #f1f5f9;
            padding: 4px 2px;
            font-weight: 900;
            text-transform: uppercase;
            text-align: center;
          }
          .expenses-section {
            border-top: 1px dashed #94a3b8;
            padding-top: 6px;
            margin-top: 6px;
            font-size: 10px;
          }
          .expense-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            margin-top: 4px;
          }
          .narrative-box {
            margin-bottom: 10px;
          }
          .narrative-box h4 {
            margin: 0 0 3px 0;
            font-size: 10.5px;
            font-weight: 900;
            text-transform: uppercase;
            color: #0f172a;
          }
          .narrative-content {
            border: 1px solid #94a3b8;
            border-radius: 3px;
            padding: 6px 8px;
            min-height: 70px;
            font-size: 10px;
            line-height: 1.35;
            background: #fdfdfd;
            white-space: pre-wrap;
          }
          .sig-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 14px;
            font-size: 10px;
          }
          .sig-box {
            width: 200px;
            text-align: center;
          }
          .sig-line {
            border-bottom: 1px solid #0f172a;
            width: 100%;
            margin-bottom: 3px;
          }
        </style>
      </head>
      <body>
        <!-- ================= PAGE 1 ================= -->
        <div class="page">
          <table class="header-table">
            <tr>
              <td style="width: 60px; text-align: left;">
                <img src="/davao-de-oro-logo.png" alt="Mabini Davao de Oro" class="header-logo" />
              </td>
              <td class="header-text">
                <h3>Republic of the Philippines</h3>
                <p>Province of Davao de Oro</p>
                <h3>MUNICIPALITY OF MABINI</h3>
                <h1>Municipal Social Welfare and Development Office</h1>
                <p style="font-size: 9px; margin-top: 2px;">Email: mswdooo2017@gmail.com</p>
              </td>
              <td style="width: 60px; text-align: right;">
                <img src="/mswdo-logo.png" alt="MSWDO" class="header-logo" />
              </td>
            </tr>
          </table>

          <div class="doc-title">GENERAL INTAKE SHEET</div>

          <div class="date-row">
            DATE OF INTERVIEW: <span class="underline-val">${gis.date_of_interview || record.reported_at || new Date().toISOString().slice(0, 10)}</span>
            &nbsp;&nbsp;&nbsp;&nbsp;
            CASE NO: <span class="underline-val" style="min-width: 120px; font-family: monospace;">${record.case_number}</span>
          </div>

          <!-- Admission & Categories Group -->
          <div class="categories-grid">
            <!-- Category -->
            <div class="category-group">
              <h4>CATEGORY</h4>
              <div class="checkbox-item">${check(category === 'walk_in')} WALK-IN</div>
              <div class="checkbox-item">${check(category === 'referred')} REFERRED</div>
              <div class="checkbox-item">${check(category === 'rescued')} RESCUED</div>
            </div>

            <!-- Sector -->
            <div class="category-group">
              <h4>SECTOR</h4>
              <div class="checkbox-item">${check(sectors.includes('4ps'))} 4Ps</div>
              <div class="checkbox-item">${check(sectors.includes('children'))} CHILDREN</div>
              <div class="checkbox-item">${check(sectors.includes('youth'))} YOUTH</div>
              <div class="checkbox-item">${check(sectors.includes('women'))} WOMEN</div>
              <div class="checkbox-item">${check(sectors.includes('senior_citizen'))} SENIOR CITIZEN</div>
              <div class="checkbox-item">${check(sectors.includes('pwd'))} PWD</div>
              <div class="checkbox-item">${check(sectors.includes('solo_parent'))} SOLO PARENT</div>
            </div>

            <!-- Case Category -->
            <div class="category-group">
              <h4>CASE CATEGORY</h4>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px;">
                <div class="checkbox-item">${check(caseCategoryType.includes('vawc'))} VAWC</div>
                <div class="checkbox-item">${check(caseCategoryType === 'acts_of_lasciviousness')} ACTS OF LASCIVIOUSNESS</div>
                <div class="checkbox-item">${check(caseCategoryType === 'rape')} RAPE</div>
                <div class="checkbox-item">${check(caseCategoryType === 'child_custody')} CHILD CUSTODY</div>
                <div class="checkbox-item">${check(caseCategoryType === 'child_support')} CHILD SUPPORT</div>
                <div class="checkbox-item">${check(caseCategoryType === 'aics')} A.I.C.S.</div>
              </div>
              <div class="checkbox-item" style="margin-top: 4px;">
                ${check(Boolean(caseCategoryOther) || caseCategoryType === 'other')} OTHERS: 
                <span style="border-bottom: 1px solid #0f172a; padding: 0 4px; font-weight: 700; flex: 1;">
                  ${caseCategoryOther || (caseCategoryType === 'other' ? 'Special Case' : '')}
                </span>
              </div>
            </div>
          </div>

          <!-- Section I: Identifying Information -->
          <div class="section-title">I. IDENTIFYING INFORMATION:</div>
          <div class="id-grid">
            <div class="field-row">
              <span class="field-label">Name of Applicant/Client:&nbsp;</span>
              <span class="field-line">${clientName.toUpperCase()}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Age:&nbsp;</span>
              <span class="field-line" style="width: 50px;">${clientAge}</span>
              <span class="field-label" style="margin-left: 8px;">Sex:&nbsp;</span>
              <span class="field-line">${check(clientSex.toLowerCase() === 'male')} Male &nbsp; ${check(clientSex.toLowerCase() === 'female')} Female</span>
            </div>

            <div class="field-row">
              <span class="field-label">Birthdate:&nbsp;</span>
              <span class="field-line">${gis.birthdate || record.incident_date || 'N/A'}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Birthplace:&nbsp;</span>
              <span class="field-line">${gis.birthplace || 'Mabini, Davao de Oro'}</span>
            </div>

            <div class="field-row" style="grid-column: span 2;">
              <span class="field-label">Present Address/Residence:&nbsp;</span>
              <span class="field-line">${clientAddress}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Length of years at resident address:&nbsp;</span>
              <span class="field-line">${gis.length_of_stay || 'N/A'}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Civil Status:&nbsp;</span>
              <span class="field-line">${gis.civil_status || 'N/A'}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Highest Educational Attainment:&nbsp;</span>
              <span class="field-line">${gis.educational_attainment || 'N/A'}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Religion:&nbsp;</span>
              <span class="field-line">${gis.religion || 'N/A'}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Present Occupation:&nbsp;</span>
              <span class="field-line">${gis.occupation || 'N/A'}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Monthly Income:&nbsp;</span>
              <span class="field-line">${gis.monthly_income ? `₱${gis.monthly_income.toLocaleString()}` : 'N/A'}</span>
            </div>

            <div class="field-row">
              <span class="field-label">Status of House Occupancy:&nbsp;</span>
              <span class="field-line">${check(gis.house_occupancy === 'owner')} Owner &nbsp;&nbsp; ${check(gis.house_occupancy === 'renter')} Renter</span>
            </div>
            <div class="field-row">
              <span class="field-label">Phone/Contact Number:&nbsp;</span>
              <span class="field-line">${clientContact || 'N/A'}</span>
            </div>

            <div class="field-row" style="grid-column: span 2;">
              <span class="field-label">Estimated damaged to property (if distressed):&nbsp;</span>
              <span class="field-line">${gis.estimated_property_damage ? `Php. ${gis.estimated_property_damage.toLocaleString()}` : 'None'}</span>
            </div>
          </div>

          <!-- Family Members Table -->
          <div style="font-weight: 800; font-size: 10px; margin: 6px 0 3px 0; text-transform: uppercase;">
            Family Members Composition:
          </div>
          <table class="family-table">
            <thead>
              <tr>
                <th>#</th>
                <th>NAME</th>
                <th>AGE</th>
                <th>CIVIL STATUS</th>
                <th>RELATIONSHIP TO CLIENT</th>
                <th>EDUCATIONAL ATTAINMENT</th>
                <th>OCCUPATION</th>
                <th>INCOME</th>
                <th>BIRTHDAY</th>
              </tr>
            </thead>
            <tbody>
              ${familyRowsHtml}
            </tbody>
          </table>

          <!-- Financial Profile -->
          <div class="expenses-section">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <div><strong>Sources of Income:</strong> <span class="underline-val" style="min-width: 180px;">${gis.sources_of_income || 'Informal / Daily Wage'}</span></div>
              <div><strong>Total Family Income:</strong> <span class="underline-val" style="min-width: 110px;">${gis.total_family_income ? `₱${gis.total_family_income.toLocaleString()}` : (gis.monthly_income ? `₱${gis.monthly_income.toLocaleString()}` : 'N/A')}</span></div>
            </div>

            <div style="font-weight: bold; margin-top: 4px;">Total Family Monthly Expenses: <span class="underline-val">${totalExpenses ? `₱${totalExpenses.toLocaleString()}` : 'N/A'}</span></div>
            <div class="expense-grid">
              <div>Food: <span class="underline-val" style="min-width: 70px;">${expenses.food ? `₱${expenses.food}` : ''}</span></div>
              <div>Water: <span class="underline-val" style="min-width: 70px;">${expenses.water ? `₱${expenses.water}` : ''}</span></div>
              <div>Electricity: <span class="underline-val" style="min-width: 70px;">${expenses.electricity ? `₱${expenses.electricity}` : ''}</span></div>
              <div>Education: <span class="underline-val" style="min-width: 70px;">${expenses.education ? `₱${expenses.education}` : ''}</span></div>
              <div>Transportation: <span class="underline-val" style="min-width: 70px;">${expenses.transportation ? `₱${expenses.transportation}` : ''}</span></div>
            </div>
          </div>
        </div>

        <!-- ================= PAGE 2 ================= -->
        <div class="page" style="padding-top: 8px;">
          <!-- Agricultural & Assets Profile -->
          <div style="border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 4px; background: #f8fafc; margin-bottom: 12px; font-size: 10px;">
            <div style="margin-bottom: 3px;">
              <strong>A. Agricultural Land (No. of hectares):</strong> 
              <span class="underline-val" style="min-width: 100px;">${gis.agricultural_profile?.hectares || 'None'}</span>
            </div>
            <div style="margin-left: 14px; margin-bottom: 2px;">
              1. Crops planted (specify): <span class="underline-val" style="min-width: 180px;">${gis.agricultural_profile?.crops_planted || 'N/A'}</span>
            </div>
            <div style="margin-left: 14px; margin-bottom: 3px;">
              2. Area of Location: <span class="underline-val" style="min-width: 200px;">${gis.agricultural_profile?.area_location || 'N/A'}</span>
            </div>

            <div style="margin-top: 4px; margin-bottom: 3px;">
              <strong>B. Other Sources of income:</strong> 
              <span class="underline-val" style="min-width: 250px;">${gis.other_sources_of_income || 'None'}</span>
            </div>

            <div style="margin-top: 4px;">
              <strong>C. Has Family Sought Outside Assistance?</strong> 
              &nbsp; ${check(Boolean(gis.has_sought_outside_assistance))} Yes &nbsp; ${check(!gis.has_sought_outside_assistance)} No
              &nbsp;&nbsp;&nbsp;&nbsp;
              If yes, what type of assistance & Source: <span class="underline-val" style="min-width: 180px;">${gis.outside_assistance_details || 'N/A'}</span>
            </div>
          </div>

          <!-- Section II: Problem Presented -->
          <div class="narrative-box">
            <h4>II. PROBLEM PRESENTED</h4>
            <div class="narrative-content">${gis.problem_presented || record.case_summary || 'No narrative recorded yet.'}</div>
          </div>

          <!-- Section III: Family Background -->
          <div class="narrative-box">
            <h4>III. FAMILY BACKGROUND INFORMATION:</h4>
            <div class="narrative-content">${gis.family_background || 'Family resides in Mabini, Davao de Oro. Details documented during intake interview.'}</div>
          </div>

          <!-- Section IV: Assessment -->
          <div class="narrative-box">
            <h4>IV. ASSESSMENT:</h4>
            <div class="narrative-content">${gis.assessment || 'Client is in need of municipal social welfare intervention and appropriate support services.'}</div>
          </div>

          <!-- Section V: Recommendation / Action Taken -->
          <div class="narrative-box">
            <h4>V. RECOMMENDATION/ACTION TAKEN:</h4>
            <div class="narrative-content">${gis.recommendation_action || record.intake_notes || 'Immediate counseling conducted. Recommended for priority psychosocial and legal/financial assistance.'}</div>
          </div>

          <!-- Priority Ranking -->
          <div style="display: flex; justify-content: space-between; margin-top: 10px; font-weight: bold; font-size: 10.5px;">
            <div>Priority Assistance for: <span class="underline-val" style="min-width: 180px;">${gis.priority_assistance_for || 'Social Service / Assistance'}</span></div>
            <div>Rank: <span class="underline-val" style="min-width: 80px; text-align: center;">${gis.priority_rank || '1'}</span></div>
          </div>

          <!-- Signatures Section -->
          <div class="sig-row" style="margin-top: 24px;">
            <div class="sig-box">
              <div style="height: 18px;"></div>
              <div class="sig-line"></div>
              <div style="font-weight: 700; text-transform: uppercase;">${gis.client_signature_name || clientName}</div>
              <div style="font-size: 8px; color: #475569;">Name & Signature of Client</div>
              <div style="font-size: 8px; margin-top: 2px;">Date: ${gis.date_interviewed || record.reported_at || ''}</div>
            </div>

            <div class="sig-box">
              <div style="height: 18px;"></div>
              <div class="sig-line"></div>
              <div style="font-weight: 700; text-transform: uppercase;">${gis.mswdo_worker_name || record.assigned_worker_name || 'MSWDO Case Worker'}</div>
              <div style="font-size: 8px; color: #475569;">Interviewed & Assessed by (MSWDO Worker)</div>
              <div style="font-size: 8px; margin-top: 2px;">Date: ${gis.date_interviewed || record.reported_at || ''}</div>
            </div>
          </div>

          <!-- Noted By Section -->
          <div style="margin-top: 28px; text-align: center; width: 100%;">
            <div style="font-size: 9px; font-weight: 700; margin-bottom: 22px;">Noted by :</div>
            <div style="display: inline-block; text-align: center;">
              <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em;">
                ${gis.noted_by_name || 'VIRGENCITA M. CHU, RSW, MPA'}
              </div>
              <div style="font-size: 9.5px; font-weight: 700; color: #334155; margin-top: 1px;">
                MSWDO
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  doc.open();
  doc.write(printHtml);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 280);
}
