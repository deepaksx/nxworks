const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

// Research a client website
router.post('/website', async (req, res) => {
  try {
    const { url, clientName } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Website URL is required' });
    }

    console.log(`Researching client: ${clientName} at ${url}`);

    // Use Claude to research the company
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `You are an SAP implementation consultant preparing for a pre-discovery workshop. Research the following company and provide a comprehensive analysis that will help generate relevant discovery questions.

Company: ${clientName || 'Unknown'}
Website: ${url}

Please analyze this company and provide:

1. **Company Overview**
   - What they do, their main products/services
   - Industry and sector classification
   - Geographic presence and markets served

2. **Business Model**
   - Revenue streams
   - Customer segments (B2B, B2C, both)
   - Distribution channels

3. **Organizational Structure** (if available)
   - Legal entities and subsidiaries
   - Key departments/functions

4. **Industry-Specific Considerations**
   - Regulatory requirements (especially UAE/GCC if applicable)
   - Industry standards and certifications
   - Common pain points in this industry

5. **Potential SAP Modules Relevance**
   - Which SAP S/4HANA modules would likely be most relevant
   - Specific industry solutions that might apply

6. **Key Areas to Explore in Workshop**
   - Critical business processes to understand
   - Integration points to investigate
   - Data migration considerations

Format your response as structured text that can be used as context for AI question generation. Be specific and actionable.`
        }
      ]
    });

    const researchText = response.content[0].text;

    res.json({
      success: true,
      research: researchText
    });
  } catch (error) {
    console.error('Research error:', error);
    res.status(500).json({
      error: 'Failed to research client: ' + (error.message || 'Unknown error')
    });
  }
});

module.exports = router;
