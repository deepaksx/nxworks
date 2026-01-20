import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReport, getSession, updateReportStatus, exportReportExcel, exportReportMarkdown, getSessionObservations } from '../services/api';
import {
  ChevronLeft,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Target,
  Lightbulb,
  Clock,
  Building2,
  Loader2,
  FileSpreadsheet,
  FileCode,
  Printer,
  Check,
  TrendingUp,
  AlertCircle,
  Database,
  GitBranch,
  List
} from 'lucide-react';

const impactColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-green-100 text-green-700 border-green-200',
  critical: 'bg-red-100 text-red-700 border-red-200'
};

const priorityColors = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-400 text-white',
  low: 'bg-blue-400 text-white'
};

const severityColors = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-blue-100 text-blue-800 border-blue-300'
};

function ReportView() {
  const { workshopId, sessionId, reportId } = useParams();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('summary');
  const [allFindings, setAllFindings] = useState([]);

  useEffect(() => {
    loadData();
  }, [reportId]);

  const loadData = async () => {
    try {
      const [reportRes, sessionRes, observationsRes] = await Promise.all([
        getReport(reportId),
        getSession(sessionId),
        getSessionObservations(sessionId)
      ]);
      setReport(reportRes.data);
      setSession(sessionRes.data);
      setAllFindings(observationsRes.data.all_findings || []);
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadExcel = () => {
    // Trigger download by opening the Excel URL
    window.open(exportReportExcel(reportId), '_blank');
  };

  const handleDownloadMarkdown = () => {
    // Trigger download by opening the Markdown URL
    window.open(exportReportMarkdown(reportId), '_blank');
  };

  const handleFinalizeReport = async () => {
    try {
      await updateReportStatus(reportId, 'final');
      setReport({ ...report, status: 'final' });
    } catch (error) {
      console.error('Failed to finalize report:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-nxsys-500" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Report not found</p>
        <Link to={`/workshop/${workshopId}/session/${sessionId}`} className="text-nxsys-500 hover:underline mt-2 inline-block">
          Back to Session
        </Link>
      </div>
    );
  }

  const keyFindings = typeof report.key_findings === 'string' ? JSON.parse(report.key_findings) : (report.key_findings || []);
  const recommendations = typeof report.recommendations === 'string' ? JSON.parse(report.recommendations) : (report.recommendations || []);
  const risksAndGaps = typeof report.risks_and_gaps === 'string' ? JSON.parse(report.risks_and_gaps) : (report.risks_and_gaps || []);
  const nextSteps = typeof report.next_steps === 'string' ? JSON.parse(report.next_steps) : (report.next_steps || []);
  const kdsItems = typeof report.kds_items === 'string' ? JSON.parse(report.kds_items) : (report.kds_items || []);
  const bpmlItems = typeof report.bpml_items === 'string' ? JSON.parse(report.bpml_items) : (report.bpml_items || []);

  const sections = [
    { id: 'summary', label: 'Executive Summary', icon: FileText },
    { id: 'obtained', label: 'All Findings', icon: List, count: allFindings.length },
    { id: 'kds', label: 'KDS', icon: Database, count: kdsItems.length },
    { id: 'bpml', label: 'BPML', icon: GitBranch, count: bpmlItems.length },
    { id: 'findings', label: 'Key Findings', icon: Target, count: keyFindings.length },
    { id: 'recommendations', label: 'Recommendations', icon: Lightbulb, count: recommendations.length },
    { id: 'risks', label: 'Risks & Gaps', icon: AlertTriangle, count: risksAndGaps.length },
    { id: 'next', label: 'Next Steps', icon: ArrowRight, count: nextSteps.length }
  ];

  return (
    <div className="space-y-4 print:space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 print:border-none print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <Link to={`/workshop/${workshopId}/session/${sessionId}`} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-nxsys-500" />
                <h1 className="text-lg font-semibold text-gray-900">{report.title}</h1>
              </div>
              <p className="text-sm text-gray-500">
                {session?.name} | Generated {new Date(report.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs rounded-full ${
              report.status === 'final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {report.status === 'final' ? 'Finalized' : 'Draft'}
            </span>
            <button onClick={handleDownloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button onClick={handleDownloadMarkdown} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800">
              <FileCode className="w-4 h-4" /> Markdown
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
              <Printer className="w-4 h-4" /> Print
            </button>
            {report.status === 'draft' && (
              <button onClick={handleFinalizeReport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                <Check className="w-4 h-4" /> Finalize
              </button>
            )}
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block">
          <div className="text-center border-b border-gray-300 pb-4 mb-4">
            <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
            <p className="text-gray-600 mt-1">{session?.name}</p>
            <p className="text-sm text-gray-500 mt-2">Generated: {new Date(report.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Section Navigation - Hidden in print */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 print:hidden">
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors ${
              activeSection === section.id
                ? 'bg-nxsys-100 text-nxsys-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <section.icon className="w-4 h-4" />
            {section.label}
            {section.count !== undefined && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeSection === section.id ? 'bg-nxsys-200' : 'bg-gray-200'
              }`}>
                {section.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 print:border-none print:shadow-none print:p-0">
        {/* Executive Summary */}
        {(activeSection === 'summary' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
          <div className={`${activeSection !== 'summary' ? 'hidden print:block' : ''} print:mb-8`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 print:text-xl print:border-b print:pb-2">
              <FileText className="w-5 h-5 text-nxsys-500" />
              Executive Summary
            </h2>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
              {report.executive_summary}
            </div>
          </div>
        )}

        {/* All Obtained Findings */}
        {activeSection === 'obtained' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <List className="w-5 h-5 text-nxsys-500" />
              All Obtained Findings ({allFindings.length})
            </h2>
            {allFindings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No findings recorded yet. Generate observations for questions to populate this list.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Q#</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Category</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Entity</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 min-w-[300px]">Finding</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Confidence</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allFindings.map((finding, idx) => (
                      <tr key={idx} className={finding.is_critical ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`font-medium ${finding.is_critical ? 'text-red-600' : 'text-gray-900'}`}>
                            {finding.question_number}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{finding.category}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{finding.entity}</td>
                        <td className="px-3 py-2 text-gray-800">{finding.item}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            finding.confidence === 'high' ? 'bg-green-100 text-green-700' :
                            finding.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {finding.confidence}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{finding.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* KDS - Key Data Structures */}
        {activeSection === 'kds' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-nxsys-500" />
              Key Data Structures (KDS) ({kdsItems.length})
            </h2>
            {kdsItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No KDS items in this report. KDS is generated when you create a Session Report.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Category</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Area</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 min-w-[200px]">Current State</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 min-w-[200px]">SAP Relevance</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Priority</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {kdsItems.map((kds, idx) => (
                      <tr key={idx} className={kds.priority === 'critical' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{kds.category}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{kds.area}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{kds.item}</td>
                        <td className="px-3 py-2 text-green-700 bg-green-50">{kds.current_state}</td>
                        <td className="px-3 py-2 text-gray-600">{kds.sap_relevance}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-xs rounded ${priorityColors[kds.priority]}`}>
                            {kds.priority}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                          {kds.source_questions?.length > 0 ? `Q${kds.source_questions.join(', Q')}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* BPML - Business Process Master List */}
        {activeSection === 'bpml' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-nxsys-500" />
              Business Process Master List (BPML) ({bpmlItems.length})
            </h2>
            {bpmlItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No BPML items in this report. BPML is generated when you create a Session Report.</p>
            ) : (
              <div className="space-y-4">
                {bpmlItems.map((bpml, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 mr-2">
                          {bpml.process_id}
                        </span>
                        <span className="text-sm text-gray-500">{bpml.category}</span>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">
                        {bpml.sap_module}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 text-lg">{bpml.process_name}</h3>
                    <p className="text-gray-600 mt-1">{bpml.description}</p>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 font-medium">Frequency:</span>
                        <span className="ml-2 text-gray-700">{bpml.frequency || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium">Stakeholders:</span>
                        <span className="ml-2 text-gray-700">
                          {bpml.stakeholders?.join(', ') || '-'}
                        </span>
                      </div>
                    </div>
                    {bpml.pain_points?.length > 0 && (
                      <div className="mt-3">
                        <span className="text-gray-500 font-medium text-sm">Pain Points:</span>
                        <ul className="mt-1 list-disc list-inside text-sm text-red-600">
                          {bpml.pain_points.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {bpml.source_questions?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-3">
                        Source: Q{bpml.source_questions.join(', Q')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Key Findings */}
        {(activeSection === 'findings' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
          <div className={`${activeSection !== 'findings' ? 'hidden print:block' : ''} print:mb-8 print:break-before-page`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 print:text-xl print:border-b print:pb-2">
              <Target className="w-5 h-5 text-nxsys-500" />
              Key Findings ({keyFindings.length})
            </h2>
            <div className="space-y-4">
              {keyFindings.map((finding, idx) => (
                <div key={idx} className={`border rounded-lg p-4 ${impactColors[finding.impact] || 'border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">{finding.category}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${impactColors[finding.impact]}`}>
                      {finding.impact} impact
                    </span>
                  </div>
                  <p className="text-gray-800">{finding.finding}</p>
                  {finding.entities_affected?.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        Entities: {finding.entities_affected.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {(activeSection === 'recommendations' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
          <div className={`${activeSection !== 'recommendations' ? 'hidden print:block' : ''} print:mb-8 print:break-before-page`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 print:text-xl print:border-b print:pb-2">
              <Lightbulb className="w-5 h-5 text-nxsys-500" />
              Recommendations ({recommendations.length})
            </h2>
            <div className="space-y-4">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 px-2 py-1 text-xs rounded ${priorityColors[rec.priority]}`}>
                      {rec.priority}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{rec.recommendation}</p>
                      <p className="text-sm text-gray-600 mt-1">{rec.rationale}</p>
                      {rec.related_findings?.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Related: {rec.related_findings.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks & Gaps */}
        {(activeSection === 'risks' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
          <div className={`${activeSection !== 'risks' ? 'hidden print:block' : ''} print:mb-8 print:break-before-page`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 print:text-xl print:border-b print:pb-2">
              <AlertTriangle className="w-5 h-5 text-nxsys-500" />
              Risks & Gaps ({risksAndGaps.length})
            </h2>
            <div className="space-y-4">
              {risksAndGaps.map((risk, idx) => (
                <div key={idx} className={`border rounded-lg p-4 ${severityColors[risk.severity]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">{risk.severity} severity</span>
                    </div>
                  </div>
                  <p className="text-gray-800 font-medium">{risk.risk}</p>
                  <div className="mt-3 bg-white/50 rounded p-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Mitigation:</span> {risk.mitigation}
                    </p>
                  </div>
                  {risk.questions_affected?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Questions affected: Q{risk.questions_affected.join(', Q')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps */}
        {(activeSection === 'next' || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
          <div className={`${activeSection !== 'next' ? 'hidden print:block' : ''} print:break-before-page`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 print:text-xl print:border-b print:pb-2">
              <ArrowRight className="w-5 h-5 text-nxsys-500" />
              Next Steps ({nextSteps.length})
            </h2>
            <div className="space-y-3">
              {nextSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-nxsys-100 flex items-center justify-center text-nxsys-700 font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{step.action}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {step.owner}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {step.timeline}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - Print only */}
      <div className="hidden print:block text-center text-sm text-gray-500 pt-8 border-t border-gray-200">
        <p>Generated by NXSYS Workshop Manager | {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}

export default ReportView;
