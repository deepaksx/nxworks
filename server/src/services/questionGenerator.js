const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Get module-specific guidance for KDS/BPML question generation
 */
function getModuleSpecificGuidance(module) {
  const moduleKey = module.split(' - ')[0].toUpperCase();

  const guidance = {
    'FI': `**Financial Accounting (FI) Focus:**
- Chart of Accounts structure (operational, group, country-specific)
- Company codes and fiscal year variants
- Document types and number ranges
- GL account determination and automatic postings
- Accounts payable/receivable processes
- Bank accounting and payment methods
- Asset accounting requirements
- Tax procedures and tax codes
- Financial closing processes (month-end, year-end)
- Parallel accounting and multiple currencies
- Intercompany transactions and reconciliation`,

    'CO': `**Controlling (CO) Focus:**
- Cost center hierarchy and structure
- Profit center accounting requirements
- Internal orders and project accounting
- Cost element categories
- Activity types and statistical key figures
- Overhead cost controlling
- Product costing and material ledger
- Profitability analysis (CO-PA) dimensions
- Transfer pricing and allocations
- Planning and budgeting processes
- Management reporting requirements`,

    'FICO': `**Finance & Controlling (FICO) Focus:**
- Chart of Accounts and GL structure
- Company codes and controlling areas
- Cost center and profit center hierarchies
- Document types and posting logic
- Accounts payable/receivable processes
- Bank accounting and cash management
- Asset accounting lifecycle
- Product costing and material ledger
- Profitability analysis dimensions
- Financial closing and consolidation
- Management and statutory reporting`,

    'MM': `**Materials Management (MM) Focus:**
- Purchasing organization structure
- Material types and material groups
- Vendor master data and classification
- Procurement processes (standard, consignment, subcontracting)
- Purchase requisition and approval workflows
- RFQ and quotation processes
- Purchase order types and release strategies
- Goods receipt processes and tolerances
- Invoice verification and 3-way matching
- Inventory management (stock types, movement types)
- Material valuation and price control
- Source determination and quota arrangements`,

    'SD': `**Sales & Distribution (SD) Focus:**
- Sales organization and distribution channels
- Customer master data and partner functions
- Pricing procedures and condition types
- Sales document types and item categories
- Availability check and ATP
- Credit management requirements
- Shipping and transportation
- Picking, packing, and delivery processes
- Billing document types and revenue recognition
- Returns and complaints handling
- Rebates and commission processing
- Third-party and intercompany sales`,

    'PP': `**Production Planning (PP) Focus:**
- Plant and production scheduling profiles
- Material master (MRP views, work scheduling)
- Bill of Materials (BOM) structure and usage
- Work centers and routings
- MRP procedures and planning strategies
- Demand management and forecasting
- Production order types and confirmation
- Capacity planning requirements
- Shop floor control processes
- Repetitive manufacturing vs discrete
- Make-to-stock vs make-to-order
- Production scheduling and sequencing`,

    'QM': `**Quality Management (QM) Focus:**
- Quality planning and inspection types
- Inspection lots and sampling procedures
- Quality info records and certificates
- Results recording and usage decisions
- Quality notifications and defect tracking
- Calibration management
- Audit management requirements
- Supplier quality management
- Quality control in procurement
- Quality control in production
- Quality certificates and compliance
- Statistical process control`,

    'PM': `**Plant Maintenance (PM) Focus:**
- Maintenance organization structure
- Functional locations and equipment
- Equipment master data and classification
- Maintenance strategies and plans
- Preventive vs corrective maintenance
- Maintenance notifications and orders
- Work center and task lists
- Spare parts planning
- Maintenance scheduling
- Mobile maintenance requirements
- Breakdown maintenance processes
- Maintenance history and analytics`,

    'PS': `**Project System (PS) Focus:**
- Project structure (WBS, networks, activities)
- Project types and profiles
- Project planning and scheduling
- Resource planning and assignments
- Project budgeting and cost control
- Progress tracking and earned value
- Project billing and revenue recognition
- Integration with procurement (MM)
- Integration with controlling (CO)
- Project reporting requirements
- Multi-project environments
- Project templates and standards`,

    'WM': `**Warehouse Management (WM) Focus:**
- Warehouse structure (storage types, bins)
- Storage unit management
- Putaway and picking strategies
- Transfer orders and confirmations
- Inventory management in warehouse
- Cycle counting procedures
- Cross-docking requirements
- Wave picking and batch processing
- RF/mobile device requirements
- Integration with MM and SD
- Warehouse monitoring and reporting
- Hazardous materials handling`,

    'EWM': `**Extended Warehouse Management (EWM) Focus:**
- Warehouse organizational structure
- Storage process and layout design
- Inbound and outbound processes
- Wave management and work packages
- Resource and labor management
- Slotting and rearrangement
- Value-added services
- Yard management
- Cross-docking optimization
- RF framework and mobile processes
- Integration with S/4HANA
- Advanced available-to-promise (aATP)`,

    'TM': `**Transportation Management (TM) Focus:**
- Transportation network design
- Carrier and freight agreement management
- Freight order processing
- Transportation planning and optimization
- Shipment tendering and carrier selection
- Freight cost calculation and settlement
- Track and trace requirements
- Integration with SD (deliveries)
- Integration with EWM
- Transportation analytics
- Compliance and documentation
- Multi-modal transportation`,

    'HCM': `**Human Capital Management (HCM) Focus:**
- Personnel administration structure
- Organizational management (positions, jobs)
- Time management requirements
- Payroll processing and frequencies
- Benefits administration
- Recruitment processes
- Performance management
- Training and development
- Employee self-service requirements
- Manager self-service requirements
- Compensation management
- Workforce analytics and reporting`,

    'SF': `**SuccessFactors Focus:**
- Employee Central requirements
- Core HR data and structures
- Time off and attendance
- Compensation and variable pay
- Performance and goals management
- Succession and career development
- Learning management
- Recruiting and onboarding
- Employee experience
- Integration with S/4HANA
- Reporting and analytics (People Analytics)
- Mobile requirements`,

    'BW': `**Business Warehouse (BW) Focus:**
- Data warehouse architecture
- InfoObjects and master data
- InfoProviders and data flows
- Extraction from source systems
- Data transformation requirements
- Data loading and scheduling
- Query and reporting requirements
- BEx vs Analysis for Office
- BW/4HANA capabilities
- Real-time reporting needs
- Data retention and archiving
- Authorization concept`,

    'MDG': `**Master Data Governance (MDG) Focus:**
- Master data domains in scope
- Data quality rules and validations
- Workflow and approval processes
- Central vs distributed governance
- Data replication scenarios
- Duplicate check and matching
- Mass processing requirements
- Change request management
- Data stewardship roles
- Integration with existing systems
- Data quality monitoring
- Compliance requirements`,

    'ARIBA': `**Ariba Focus:**
- Procurement collaboration scenarios
- Supplier lifecycle management
- Sourcing and contract management
- Guided buying and catalogs
- Purchase order collaboration
- Invoice management
- Supply chain collaboration
- Integration with S/4HANA
- Supplier network connectivity
- Spend visibility and analytics
- Compliance and risk management
- User experience requirements`,

    'INTEGRATION': `**Integration Focus:**
- Integration landscape and architecture
- Real-time vs batch integration
- API management requirements
- EDI and B2B integration
- Integration with legacy systems
- Cloud integration scenarios
- Integration middleware (PI/PO, CPI)
- Master data synchronization
- Event-driven integration
- Error handling and monitoring
- Security and authentication
- Integration testing approach`,

    'BASIS': `**Basis/Technical Administration Focus:**
- System landscape architecture
- High availability requirements
- Disaster recovery approach
- Performance requirements and SLAs
- Security and authorization concept
- User management and SSO
- Transport management
- Background job scheduling
- Printing and output management
- System monitoring requirements
- Database administration
- Upgrade and maintenance windows`,

    'FIORI': `**Fiori/UI Focus:**
- User experience requirements
- Fiori launchpad design
- Role-based app assignments
- Custom app requirements
- Mobile device support
- Offline capabilities
- Fiori app extensions
- Theme and branding
- Search and navigation
- Notifications and alerts
- Analytics and dashboards
- Accessibility requirements`,
  };

  // Find matching guidance or return default
  for (const [key, value] of Object.entries(guidance)) {
    if (moduleKey.includes(key) || module.toUpperCase().includes(key)) {
      return value;
    }
  }

  // Default guidance for unknown modules
  return `**${module} Focus:**
- Organizational structure specific to this module
- Master data objects and attributes
- Core business processes
- Transaction types and documents
- Reporting and analytics requirements
- Integration with other modules
- Compliance and control requirements
- Custom development needs`;
}

/**
 * Generate discovery questions for an SAP implementation workshop
 */
async function generateQuestions(config) {
  const {
    agenda,
    entities,
    audience,
    module,
    targetCount = 30,
    industryContext,
    customInstructions,
    sessionName,
    topics
  } = config;

  // Build entity context string
  const entityContext = entities.map(e => {
    let context = `- ${e.code} (${e.name})`;
    if (e.industry) context += ` - Industry: ${e.industry}`;
    if (e.sector) context += `, Sector: ${e.sector}`;
    if (e.business_context) context += `\n  Context: ${e.business_context}`;
    return context;
  }).join('\n');

  // Build audience context string
  const audienceContext = audience.map(a => {
    let context = `- ${a.department}`;
    if (a.typical_roles) context += `: ${a.typical_roles}`;
    if (a.key_concerns) context += ` (Concerns: ${a.key_concerns})`;
    return context;
  }).join('\n');

  const systemPrompt = `You are an experienced SAP S/4HANA implementation consultant conducting a pre-discovery workshop. Your role is to gather requirements systematically to create KDS (Key Design Specification) and BPML (Business Process Master List) documents.

**CRITICAL RULES:**
1. ALL questions MUST be strictly relevant to the specified SAP module - do NOT ask generic questions
2. Questions must capture information needed for KDS and BPML deliverables
3. Questions MUST follow a STRICT LOGICAL SEQUENCE - this is NON-NEGOTIABLE

**SEQUENCING IS CRITICAL - Follow This Exact Pattern:**

You are conducting an interview. Each question must:
- Build upon information from previous questions
- Flow naturally like a real conversation
- Move from general to specific within each topic
- Complete one topic fully before moving to the next
- Never jump ahead or back to earlier topics

**STRICT QUESTION SEQUENCE (Must follow this exact order):**

═══════════════════════════════════════════════════════════════
SECTION A: FOUNDATION & CONTEXT (Questions 1-10%)
═══════════════════════════════════════════════════════════════
Start with the basics to understand the landscape:
A1. Organizational structure overview for this module
A2. Number of entities/units involved
A3. Geographic spread and locations
A4. Key stakeholders and their roles

═══════════════════════════════════════════════════════════════
SECTION B: MASTER DATA (Questions 11-25%)
═══════════════════════════════════════════════════════════════
Understand the data foundation:
B1. What master data objects exist for this module?
B2. How is each master data currently maintained?
B3. Data volumes and growth patterns
B4. Data quality issues and challenges
B5. Data ownership and governance

═══════════════════════════════════════════════════════════════
SECTION C: CURRENT PROCESSES - AS-IS (Questions 26-50%)
═══════════════════════════════════════════════════════════════
Deep dive into current state - follow the process flow:
C1. Start with the FIRST step of the main process
C2. Then ask about the NEXT step sequentially
C3. Continue through the entire process end-to-end
C4. Ask about process variants and exceptions
C5. Identify manual steps and workarounds
C6. Document approval workflows
C7. Capture pain points AT EACH STEP

═══════════════════════════════════════════════════════════════
SECTION D: FUTURE STATE - TO-BE (Questions 51-70%)
═══════════════════════════════════════════════════════════════
Build the target state:
D1. Desired improvements for each pain point identified
D2. Process changes wanted
D3. Automation opportunities
D4. Standard SAP vs custom requirements
D5. New capabilities needed

═══════════════════════════════════════════════════════════════
SECTION E: TRANSACTIONS & DOCUMENTS (Questions 71-80%)
═══════════════════════════════════════════════════════════════
E1. Document types and formats
E2. Transaction volumes
E3. Peak periods and performance needs
E4. Output requirements (forms, prints, emails)

═══════════════════════════════════════════════════════════════
SECTION F: REPORTING & ANALYTICS (Questions 81-88%)
═══════════════════════════════════════════════════════════════
F1. Current reports being used
F2. Report gaps and new requirements
F3. Dashboard and KPI needs
F4. Real-time vs batch reporting

═══════════════════════════════════════════════════════════════
SECTION G: INTEGRATION (Questions 89-95%)
═══════════════════════════════════════════════════════════════
G1. Integration with other SAP modules
G2. External system interfaces
G3. Data flow direction and frequency

═══════════════════════════════════════════════════════════════
SECTION H: COMPLIANCE & WRAP-UP (Questions 96-100%)
═══════════════════════════════════════════════════════════════
H1. Regulatory and compliance requirements
H2. Audit and control needs
H3. Security and authorization
H4. Timeline and priorities

**CONVERSATION FLOW EXAMPLE:**
Q1: "What is your organizational structure for [module]?"
Q2: "How many [entities] do you have?" (builds on Q1)
Q3: "Where are these [entities] located?" (builds on Q2)
Q4: "Who are the key users of [module] in each location?" (builds on Q3)
... and so on, always building on previous answers.

**KDS Information to Capture:**
- Organizational elements and hierarchies
- Master data objects and attributes
- Configuration requirements
- Custom development needs
- Authorization requirements
- Data migration scope

**BPML Information to Capture:**
- End-to-end process flows
- Process steps and activities
- Roles at each step
- Decision points and business rules
- Exception handling
- Approval workflows`;

  // Module-specific focus areas for KDS/BPML
  const moduleGuidance = getModuleSpecificGuidance(module);

  // Build topics section if provided
  // Handle both comma and newline separators
  const topicsList = topics ? topics.split(/[,\n]+/).map(t => t.trim()).filter(t => t) : [];
  const topicsSection = topicsList.length > 0 ? `
**PRIORITY TOPICS TO COVER (MANDATORY):**
The following topics MUST be covered thoroughly with multiple questions each:
${topicsList.map(t => `- ${t}`).join('\n')}

You MUST ensure these topics are covered in depth. Allocate approximately ${Math.floor(targetCount * 0.7)} questions (70%) to these specific topics, distributing them appropriately across the sections A-H. The remaining questions can cover other relevant areas of ${module} that support the KDS/BPML documentation.
` : '';

  const userPrompt = `Generate ${targetCount} discovery questions for this SAP S/4HANA workshop session:

**Session:** ${sessionName}
**SAP Module:** ${module}

**IMPORTANT: Questions must be 100% specific to ${module}. Do NOT include generic business questions.**
${topicsSection}
**Session Agenda/Focus:**
${agenda || 'Full discovery for ' + module}

**Business Entities:**
${entityContext || 'Not specified - ask about organizational structure'}

**Target Audience:**
${audienceContext || 'Business stakeholders'}

**Industry Context:**
${industryContext || 'Not specified'}

${customInstructions ? `**Special Instructions:**\n${customInstructions}` : ''}

**MODULE-SPECIFIC FOCUS AREAS FOR ${module}:**
${moduleGuidance}

**CRITICAL REQUIREMENTS:**

1. **STRICT SEQUENCING (Most Important!):**
   - Questions MUST flow in logical order: A → B → C → D → E → F → G → H
   - Each question builds on the previous one
   - NEVER jump between sections randomly
   - Complete each section before moving to the next
   - Within each section, go from general to specific

2. **Module Specificity**:
   - Every question MUST directly relate to ${module} functionality
   - Use SAP-specific terminology relevant to ${module}
   - Ask about specific transactions, master data, and processes for this module
   - Do NOT ask generic questions - be specific to ${module}

3. **Conversation Flow**:
   - Imagine you are interviewing someone face-to-face
   - Each answer logically leads to the next question
   - Group related questions together
   - Use transition phrases in rationale to show connection

4. **Question Style**:
   - Open-ended (never yes/no)
   - Use SAP terminology where appropriate
   - One topic per question
   - Start with "What", "How", "Describe", "Walk me through", "Tell me about"

5. **Mark as Critical** (~15% of questions):
   - Scope-defining questions
   - Questions that impact architecture decisions
   - Questions about must-have requirements

**Section-to-Category Mapping:**
- Section A → "Organizational Structure"
- Section B → "Master Data"
- Section C → "Business Processes - Current State"
- Section D → "Business Processes - Future State"
- Section E → "Transactions & Documents"
- Section F → "Reporting & Analytics"
- Section G → "Integration & Interfaces"
- Section H → "Compliance & Controls"

**Output Format - JSON array:**
\`\`\`json
[
  {
    "question_text": "The question",
    "sub_module": "The specific sub-module/functional area (e.g., 'Purchasing Org', 'Material Master', 'Vendor Master', 'Purchase Order', 'Goods Receipt', 'Invoice Verification')",
    "category_name": "Category from section mapping above",
    "entity_code": "ENTITY or null for general",
    "is_critical": false,
    "rationale": "Why this question matters and HOW IT CONNECTS to the previous/next question"
  }
]
\`\`\`

**IMPORTANT - Sub-Module Field:**
Each question MUST include a "sub_module" field indicating the specific functional area within ${module}. Use concise, recognizable SAP terminology. Examples:
- For MM: "Purchasing Org", "Material Master", "Vendor Master", "Material Groups", "Procurement", "Purchase Requisition", "Purchase Order", "Goods Receipt", "Invoice Verification", "Inventory Management", "Valuation"
- For FICO: "Chart of Accounts", "GL Accounts", "Cost Centers", "Profit Centers", "AP", "AR", "Asset Accounting", "Bank Accounting", "Tax", "Closing"
- For SD: "Sales Org", "Customer Master", "Pricing", "Sales Order", "Delivery", "Billing", "Credit Management", "Returns"
- Use short, clear labels (2-3 words max)

**FINAL CHECK BEFORE GENERATING:**
- Are questions 1-10% about organizational structure?
- Are questions 11-25% about master data?
- Are questions 26-50% about current processes (following the process flow)?
- Are questions 51-70% about future state?
- Are questions 71-80% about transactions/documents?
- Are questions 81-88% about reporting?
- Are questions 89-95% about integration?
- Are questions 96-100% about compliance and wrap-up?

Generate exactly ${targetCount} WELL-SEQUENCED questions strictly about ${module}. Return ONLY valid JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    const content = response.content[0].text;

    // Parse JSON response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const questions = JSON.parse(jsonStr.trim());

    return questions.map((q, index) => {
      // Prepend sub-module prefix to question text if provided
      const subModulePrefix = q.sub_module ? `[${q.sub_module}] ` : '';
      return {
        question_number: index + 1,
        question_text: subModulePrefix + q.question_text,
        category_name: q.category_name || 'General',
        entity_code: q.entity_code || null,
        is_critical: !!q.is_critical,
        ai_rationale: q.rationale || ''
      };
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error(`Failed to generate questions: ${error.message}`);
  }
}

/**
 * Regenerate a single question with specific context
 */
async function regenerateQuestion(params) {
  const {
    originalQuestion,
    feedback,
    module,
    entityContext,
    audienceContext
  } = params;

  const prompt = `You are an SAP S/4HANA implementation consultant. Improve this discovery question based on the feedback.

**Original Question:**
${originalQuestion}

**Feedback:**
${feedback || 'Please provide a better alternative that is more specific and actionable.'}

**Context:**
- SAP Module: ${module}
- Entity: ${entityContext || 'General'}

**Requirements:**
- Open-ended question (not yes/no)
- Specific and actionable
- Professional but conversational
- Should uncover requirements or pain points
- Include a sub_module tag indicating the specific functional area

Return JSON:
\`\`\`json
{
  "question_text": "The improved question (without prefix)",
  "sub_module": "Specific functional area (e.g., 'Purchasing Org', 'Material Master', 'GL Accounts')",
  "category_name": "Appropriate category",
  "is_critical": true/false,
  "rationale": "Why this question is better"
}
\`\`\``;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0].text;
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result = JSON.parse(jsonStr.trim());
    // Prepend sub-module prefix to question text if provided
    if (result.sub_module) {
      result.question_text = `[${result.sub_module}] ${result.question_text}`;
    }
    return result;
  } catch (error) {
    console.error('Error regenerating question:', error);
    throw new Error(`Failed to regenerate question: ${error.message}`);
  }
}

module.exports = {
  generateQuestions,
  regenerateQuestion
};
