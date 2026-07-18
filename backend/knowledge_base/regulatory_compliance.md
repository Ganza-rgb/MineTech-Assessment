# MineTech Rwanda — Regulatory Compliance

## 1. Rwanda Mines, Petroleum and Gas Board (RMB)

### Mining License Categories
- **Exploration License (EL):** 3-year validity, 50km² maximum area
- **Prospecting License (PL):** 2-year validity, 20km² maximum area
- **Mining License (ML):** up to 25 years, specific concession boundaries
- **Quarry License (QL):** for construction minerals, 5-year validity

### Reporting Requirements
| Report Type | Frequency | Submission To | Content |
|-------------|-----------|---------------|---------|
| Production Report | Monthly | RMB | Tonnes mined, ore grade, waste rock, recovery |
| Safety Report | Monthly | RMB | Incidents, near-misses, training hours, PPE compliance |
| Environmental Report | Quarterly | RMB | Water usage, dust emissions, rehabilitation progress |
| Royalty Statement | Monthly | Rwanda Revenue Authority (RRA) | Calculated royalties, sales revenue |
| Mineral Export Permit | Per shipment | RMB | Weight, assay certificates, buyer details |

### Royalty Rates (Rwanda)
- **3TG minerals (tin, tantalum, tungsten, gold):** 4% of gross value
- **Precious stones:** 5% of gross value
- **Base metals:** 3% of gross value
- **Construction minerals:** 2% of gross value

## 2. Rwanda Social Security Board (RSSB) Compliance

### Worker Registration
- All mine workers must be registered with RSSB within 7 days of employment
- Required data: full name, national ID, date of birth, occupation, employer, emergency contact
- Minetech OS auto-validates registrations against RSSB database

### Shift Allocation & Clearance
- **rssb_clearance_required:** TRUE for any emergency crew reassignment or extended shift allocation
- Continuous validation against active worker database required
- Overtime tracking: maximum 2 hours/day, 10 hours/week without special approval

### Social Security Contributions
- **Employer contribution:** 5% of gross salary
- **Employee contribution:** 5% of gross salary
- **Occupational injury insurance:** mandatory for all mining operations
- **Pension scheme:** mandatory enrollment within 30 days of employment

## 3. Environmental Compliance

### Environmental Impact Assessment (EIA)
- Required for all new mining projects >5 hectares
- Valid for 3 years; renewal required for project extensions
- Public consultation mandatory before EIA approval

### Rehabilitation Bond
- Amount: 2% of total project capital cost
- Held by Rwanda Environment Management Authority (REMA)
- Released upon successful rehabilitation (typically 5–10 years post-closure)

### Water Management
- Mining operations must obtain water abstraction permit from Rwanda Water and Sanitation Corporation (WASAC)
- Effluent discharge must meet Rwandan standards (RS 207:2020)
- Tailings dams: quarterly inspections + annual dam safety review

## 4. International Standards

### OECD Due Diligence
- 5-step framework for responsible mineral supply chains
- Required for 3TG minerals exported to OECD countries
- Minetech Trace automates documentation and reporting

### ITSCI (International Tin Supply Chain Initiative)
- Covers: tin, tantalum, tungsten, gold from Central Africa
- Requirements: mine-level traceability, bag-and-tag system, exporter declarations
- Minetech Trace is ITSCI-compatible

### ISO Certifications (Target)
- **ISO 45001:** Occupational health and safety management
- **ISO 14001:** Environmental management
- **ISO 9001:** Quality management
