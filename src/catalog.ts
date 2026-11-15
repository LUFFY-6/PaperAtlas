import { disciplines, type Field } from './papers.ts'

type Entry = [id: string, title: string, alternatePdf?: string]

const entries: Record<string, Entry[]> = {
  computing: [
    ["1706.03762", "Attention Is All You Need"],
    ["1512.03385", "Deep Residual Learning for Image Recognition"],
    ["1406.2661", "Generative Adversarial Nets"],
    ["1412.6980", "Adam: A Method for Stochastic Optimization"],
    ["1810.04805", "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"],
    ["2005.14165", "Language Models are Few-Shot Learners", "https://proceedings.neurips.cc/paper/2020/file/1457c0d6bfcb4967418bfb8ac142f64a-Paper.pdf"],
    ["2006.11239", "Denoising Diffusion Probabilistic Models", "https://proceedings.neurips.cc/paper/2020/file/4c5bcfec8584af0d967f1ab10179ca4b-Paper.pdf"],
    ["1505.04597", "U-Net: Convolutional Networks for Biomedical Image Segmentation"],
    ["2005.11401", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"],
    ["2106.09685", "LoRA: Low-Rank Adaptation of Large Language Models", "https://openreview.net/pdf?id=nZeVKeeFYf9"],
  ],
  mechanical: [
    ["1105.1186", "Sampling-based Algorithms for Optimal Motion Planning"],
    ["1405.5848", "Batch Informed Trees (BIT*): Sampling-based Optimal Planning via the Heuristically Guided Search of Implicit Random Geometric Graphs"],
    ["1610.06475", "ORB-SLAM2: an Open-Source SLAM System for Monocular, Stereo and RGB-D Cameras"],
    ["2007.11898", "ORB-SLAM3: An Accurate Open-Source Library for Visual, Visual-Inertial and Multi-Map SLAM"],
    ["1404.2334", "Informed RRT*: Optimal Sampling-based Path Planning Focused via Direct Sampling of an Admissible Ellipsoidal Heuristic"],
    ["1509.02971", "Continuous Control with Deep Reinforcement Learning"],
    ["1802.09564", "Reinforcement and Imitation Learning for Diverse Visuomotor Skills"],
    ["2203.02176", "ST-RRT*: Asymptotically-Optimal Bidirectional Motion Planning through Space-Time"],
    ["1603.02199", "Learning Hand-Eye Coordination for Robotic Grasping with Deep Learning and Large-Scale Data Collection"],
    ["2109.06976", "GRiD: GPU-Accelerated Rigid Body Dynamics with Analytical Gradients"],
  ],
  electronics: [
    ["0807.3917", "Channel polarization: A method for constructing capacity-achieving codes for symmetric binary-input memoryless channels"],
    ["1304.6690", "Massive MIMO for Next Generation Wireless Systems"],
    ["math/0409186", "Robust Uncertainty Principles: Exact Signal Reconstruction from Highly Incomplete Frequency Information"],
    ["1206.0050", "List Decoding of Polar Codes"],
    ["1706.01151", "Deep MIMO Detection"],
    ["1802.02623", "OTFS: A New Generation of Modulation Addressing the Challenges of 5G"],
    ["1605.04283", "Modeling and Analyzing Millimeter Wave Cellular Systems"],
    ["0911.4219", "Message Passing Algorithms for Compressed Sensing: I. Motivation and Construction"],
    ["2012.03181", "Beam Management in 5G: A Stochastic Geometry Analysis"],
    ["2202.03220", "Deep Learning based Channel Estimation for Massive MIMO with Hybrid Transceivers"],
  ],
  physics: [
    ["1602.03837", "Observation of Gravitational Waves from a Binary Black Hole Merger"],
    ["1710.05832", "GW170817: Observation of Gravitational Waves from a Binary Neutron Star Inspiral", "https://dcc.ligo.org/public/0145/P170817/008/LIGO-P170817.pdf"],
    ["1906.11238", "First M87 Event Horizon Telescope Results. I. The Shadow of the Supermassive Black Hole"],
    ["1807.06209", "Planck 2018 results. VI. Cosmological parameters"],
    ["1707.01621", "Observation of the Doubly Charmed Baryon Ξcc++", "https://cds.cern.ch/record/2273486/files/arXiv%3A1707.01621.pdf"],
    ["1207.7214", "Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC"],
    ["1207.7235", "Observation of a new boson at a mass of 125 GeV with the CMS experiment at the LHC"],
    ["1703.01424", "Seven temperate terrestrial planets around the nearby ultracool dwarf star TRAPPIST-1"],
    ["1508.05949", "Experimental loophole-free violation of a Bell inequality using entangled electron spins separated by 1.3 km"],
    ["1909.06048", "An improved upper limit on the neutrino mass from a direct kinematic method by KATRIN"],
  ],
  mathematics: [
    ["math/0211159", "The entropy formula for the Ricci flow and its geometric applications"],
    ["math/0303109", "Ricci flow with surgery on three-manifolds"],
    ["math/0307245", "Finite extinction time for the solutions to the Ricci flow on certain three-manifolds"],
    ["0801.1095", "Simultaneous analysis of Lasso and Dantzig selector"],
    ["1404.5609", "Controlling the false discovery rate via knockoffs"],
    ["2107.07511", "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification"],
    ["1905.03222", "Conformalized Quantile Regression"],
    ["math/0509166", "Stationary Solutions of Stochastic Differential Equation with Memory and Stochastic Partial Differential Equations"],
    ["math/0509489", "Strichartz Estimates for Long Range Perturbations"],
    ["1312.5709", "Random time with differentiable conditional distribution function"],
  ],
  narrative: [
    ["000092", "Missed Connections: The Collective Novel and the Metropolis"],
    ["000093", "Winesburg, Ohio: A Modernist Kluge"],
    ["000094", "Network Narration in John Dos Passos’s U.S.A. Trilogy"],
    ["000096", "The Globe is All One: Wars I Have Seen as Proto-Network Narrative"],
    ["000097", "Theorizing Connectivity: Modernism and the Network Narrative"],
    ["000101", "Because It’s Not There: Ekphrasis and the Threat of Graphics in Interactive Fiction"],
    ["000397", "Machine-aided Close Listening: Prosthetic Synaesthesia and the 3D Phonotext"],
    ["000398", "How Technology Means: Texts, History, and Their Associated Technologies"],
    ["000385", "Reviving Classical Drama: Virtual Reality and Experiential Learning in a Traditional Classroom"],
    ["000672", "A Keyword Analysis of Climate Change in Contemporary Literary Studies, 2000–2022"],
  ],
  digital: [
    ["000099", "Digital Literature and the Modernist Problem"],
    ["000104", "Writing to be Found and Writing Readers"],
    ["000103", "The New Place of Reading: Locative Media and the Future of Narrative"],
    ["000378", "Methodological Nearness and the Question of Computational Literature"],
    ["000154", "The Literary And/As the Digital Humanities"],
    ["000155", "The Idiocy of the Digital Literary"],
    ["000705", "Computational Art Explorations of Linguistic Possibility Spaces"],
    ["000707", "Any Means Necessary to Refuse Erasure by Algorithm"],
    ["000693", "Poetry as Code as Interactive Fiction"],
    ["000185", "Computers, Comics and Cult Status: A Forensics of Digital Graphic Novels"],
  ],
  labor: [
    ["w4509", "Minimum Wages and Employment: A Case Study of the Fast Food Industry in New Jersey and Pennsylvania"],
    ["w3710", "Do Minimum Wages Reduce Employment? A Case Study of California, 1987–89"],
    ["w25434", "The Effect of Minimum Wages on Low-Wage Jobs: Evidence from the United States Using a Bunching Estimator"],
    ["w25719", "Labor Market Power"],
    ["w32901", "What’s Across the Border? Re-Evaluating the Cross-Border Evidence on Minimum Wage Effects"],
    ["w32902", "Restaurant Employment, Minimum Wages, and Border Discontinuities"],
    ["w32878", "Minimum Wages in the 21st Century"],
    ["w25240", "Minimum Wages and the Distribution of Family Incomes"],
    ["w14683", "Immigration and Inequality"],
    ["w26523", "Does a One-Size-Fits-All Minimum Wage Cause Financial Stress for Small Businesses?"],
  ],
  policy: [
    ["w16381", "How Does Your Kindergarten Classroom Affect Your Earnings? Evidence From Project STAR"],
    ["w7656", "The Effect of Attending a Small Class in the Early Grades on College-Test Taking and Middle School Test Results"],
    ["w19423", "Measuring the Impacts of Teachers I: Evaluating Bias in Teacher Value-Added Estimates"],
    ["w19424", "Measuring the Impacts of Teachers II: Teacher Value-Added and Student Outcomes in Adulthood"],
    ["w19275", "Stand and Deliver: Effects of Boston’s Charter High Schools on College Preparation, Entry, and Choice"],
    ["w15549", "Accountability and Flexibility in Public Schools: Evidence from Boston’s Charters and Pilots"],
    ["w21839", "Free to Choose: Can School Choice Reduce Student Achievement?"],
    ["w19576", "Small High Schools and Student Achievement: Lottery-Based Evidence from New York City"],
    ["w10113", "The Effect of School Choice on Student Outcomes: Evidence from Randomized Lotteries"],
    ["w21705", "Research Design Meets Market Design: Using Centralized Assignment for Impact Evaluation"],
  ],
}

export type StudyField = Exclude<Field, 'custom'>
export type StudyPaper = { id: string; title: string; field: StudyField; discipline: string; url: string; venue: string; alternatePdf?: string }

export const studyFields = Object.keys(disciplines).filter((field): field is StudyField => field !== 'custom')

export const catalog = studyFields.flatMap((field) =>
  Object.keys(disciplines[field]).flatMap((discipline) => entries[discipline].map(([key, title, alternatePdf]): StudyPaper => {
    const source = field === 'literature' ? 'dhq' : key.startsWith('w') ? 'nber' : 'arxiv'
    const url = source === 'dhq' ? 'https://dhq-static.digitalhumanities.org/pdf/' + key + '.pdf'
      : source === 'nber' ? 'https://www.nber.org/system/files/working_papers/' + key + '/' + key + '.pdf'
        : 'https://arxiv.org/pdf/' + key
    return {
      id: source + '-' + key.replace('/', '-'), title, field, discipline, alternatePdf, url,
      venue: source === 'dhq' ? 'Digital Humanities Quarterly' : source === 'nber' ? 'NBER' : 'arXiv',
    }
  })),
)

