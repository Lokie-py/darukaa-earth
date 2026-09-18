import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Line } from "react-chartjs-2";

import api from "../services/api";

import "../styles/dashboard.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function Dashboard() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const draw = useRef(null);

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [analytics, setAnalytics] = useState([]);

  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const [creating, setCreating] = useState(false);
  const [savingSite, setSavingSite] = useState(false);

  const [error, setError] = useState("");

  const [showProjectForm, setShowProjectForm] = useState(false);

  const [showSiteForm, setShowSiteForm] = useState(false);

  const [draftGeometry, setDraftGeometry] = useState(null);

  const [siteForm, setSiteForm] = useState({
    name: "",
    description: "",
  });

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
  });

  const selectedProject = projects[0];

  // =====================================================
  // LOAD PROJECTS
  // =====================================================

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/projects");

      const projectData = response.data || [];

      setProjects(projectData);

      if (projectData.length > 0) {
        await loadSites(projectData[0].id);
      } else {
        setSites([]);
        setSelectedSite(null);
        setAnalytics([]);
      }
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // LOAD SITES
  // =====================================================

  const loadSites = async (projectId) => {
    try {
      const response = await api.get(`/projects/${projectId}/sites`);

      const siteData = response.data || [];

      setSites(siteData);

      if (siteData.length > 0) {
        await handleSiteSelect(siteData[0], projectId);
      } else {
        setSelectedSite(null);
        setAnalytics([]);
      }
    } catch (err) {
      console.error(err);

      setSites([]);
      setSelectedSite(null);
      setAnalytics([]);
    }
  };

  // =====================================================
  // CREATE PROJECT
  // =====================================================

  const handleProjectChange = (event) => {
    setProjectForm({
      ...projectForm,
      [event.target.name]: event.target.value,
    });
  };

  const createProject = async (event) => {
    event.preventDefault();

    try {
      setCreating(true);
      setError("");

      await api.post("/projects", projectForm);

      setProjectForm({
        name: "",
        description: "",
      });

      setShowProjectForm(false);

      await loadProjects();
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to create project.");
    } finally {
      setCreating(false);
    }
  };

  // =====================================================
  // INITIALIZE MAPBOX
  // =====================================================

  useEffect(() => {
    if (loading || !mapContainer.current || map.current) {
      return;
    }

    if (!MAPBOX_TOKEN) {
      console.error("Mapbox token is missing. Check frontend/.env");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const mapInstance = new mapboxgl.Map({
      accessToken: MAPBOX_TOKEN,
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [73.81, 18.51],
      zoom: 10,
    });

    map.current = mapInstance;

    mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Mapbox Draw
    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    draw.current = drawInstance;

    mapInstance.addControl(drawInstance, "top-left");

    // Polygon created
    mapInstance.on("draw.create", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      if (feature.geometry.type === "Polygon") {
        setDraftGeometry(feature.geometry);
        setShowSiteForm(true);
      }
    });

    // Polygon edited
    mapInstance.on("draw.update", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      if (feature.geometry.type === "Polygon") {
        setDraftGeometry(feature.geometry);
      }
    });

    // Map completely loaded
    mapInstance.on("load", () => {
      console.log("Mapbox map loaded successfully.");

      setMapReady(true);
    });

    mapInstance.on("error", (event) => {
      console.error("Mapbox error:", event?.error || event);
    });

    return () => {
      mapInstance.remove();

      map.current = null;
      draw.current = null;
      setMapReady(false);
    };
  }, [loading]);

  // =====================================================
  // DISPLAY SAVED SITES ON MAP
  // =====================================================

  useEffect(() => {
    if (!mapReady || !map.current) {
      return;
    }

    const mapInstance = map.current;

    const features = sites
      .filter(
        (site) =>
          site.geometry &&
          site.geometry.type === "Polygon" &&
          Array.isArray(site.geometry.coordinates) &&
          site.geometry.coordinates.length > 0,
      )
      .map((site) => ({
        type: "Feature",
        properties: {
          id: site.id,
          name: site.name,
        },
        geometry: site.geometry,
      }));

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    // -------------------------------------------------
    // CREATE SOURCE
    // -------------------------------------------------

    if (!mapInstance.getSource("sites")) {
      mapInstance.addSource("sites", {
        type: "geojson",
        data: geojson,
      });

      // Polygon fill
      mapInstance.addLayer({
        id: "site-fill",
        type: "fill",
        source: "sites",
        paint: {
          "fill-color": "#4d7659",
          "fill-opacity": 0.35,
        },
      });

      // Polygon border
      mapInstance.addLayer({
        id: "site-outline",
        type: "line",
        source: "sites",
        paint: {
          "line-color": "#315b43",
          "line-width": 3,
        },
      });

      // -------------------------------------------------
      // SITE CLICK
      // -------------------------------------------------

      mapInstance.on("click", "site-fill", (event) => {
        const feature = event.features?.[0];

        if (!feature) {
          return;
        }

        const siteId = Number(feature.properties?.id);

        const site = sites.find((item) => item.id === siteId);

        if (site) {
          handleSiteSelect(site);
        }
      });

      // -------------------------------------------------
      // HOVER
      // -------------------------------------------------

      mapInstance.on("mouseenter", "site-fill", () => {
        mapInstance.getCanvas().style.cursor = "pointer";
      });

      mapInstance.on("mouseleave", "site-fill", () => {
        mapInstance.getCanvas().style.cursor = "";
      });
    } else {
      // -------------------------------------------------
      // UPDATE EXISTING SOURCE
      // -------------------------------------------------

      mapInstance.getSource("sites").setData(geojson);
    }

    // -------------------------------------------------
    // ZOOM TO SAVED SITE
    // -------------------------------------------------

    if (features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();

      features.forEach((feature) => {
        const polygon = feature.geometry.coordinates;

        polygon.forEach((ring) => {
          ring.forEach(([longitude, latitude]) => {
            bounds.extend([longitude, latitude]);
          });
        });
      });

      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds, {
          padding: 50,
          maxZoom: 12,
          duration: 600,
        });
      }
    }
  }, [sites, mapReady]);

  // =====================================================
  // START DRAWING
  // =====================================================

  const startDrawing = () => {
    if (!draw.current) {
      setError("Map is still loading. Please try again.");

      return;
    }

    setError("");
    setDraftGeometry(null);

    const existing = draw.current.getAll();

    if (existing.features.length > 0) {
      draw.current.deleteAll();
    }

    draw.current.changeMode("draw_polygon");
  };

  // =====================================================
  // SITE FORM
  // =====================================================

  const handleSiteChange = (event) => {
    setSiteForm({
      ...siteForm,
      [event.target.name]: event.target.value,
    });
  };

  const cancelSiteForm = () => {
    setShowSiteForm(false);
    setDraftGeometry(null);

    setSiteForm({
      name: "",
      description: "",
    });

    if (draw.current) {
      draw.current.deleteAll();

      draw.current.changeMode("simple_select");
    }
  };

  // =====================================================
  // CREATE SITE
  // =====================================================

  const createSite = async (event) => {
    event.preventDefault();

    if (!selectedProject) {
      setError("Please create a project first.");

      return;
    }

    if (!draftGeometry) {
      setError("Draw a polygon on the map before saving the site.");

      return;
    }

    try {
      setSavingSite(true);
      setError("");

      await api.post(`/projects/${selectedProject.id}/sites`, {
        name: siteForm.name,
        description: siteForm.description,
        geometry: draftGeometry,
      });

      setSiteForm({
        name: "",
        description: "",
      });

      setDraftGeometry(null);
      setShowSiteForm(false);

      if (draw.current) {
        draw.current.deleteAll();

        draw.current.changeMode("simple_select");
      }

      await loadSites(selectedProject.id);
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to create site.");
    } finally {
      setSavingSite(false);
    }
  };

  // =====================================================
  // SELECT SITE
  // =====================================================

  const handleSiteSelect = async (site, projectId = selectedProject?.id) => {
    setSelectedSite(site);

    if (!projectId) {
      return;
    }

    try {
      const response = await api.get(
        `/projects/${projectId}/sites/${site.id}/analytics`,
      );

      setAnalytics(response.data || []);
    } catch (err) {
      console.error(err);

      setAnalytics([]);
    }
  };

  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout = () => {
    localStorage.removeItem("token");

    window.location.href = "/login";
  };

  // =====================================================
  // ANALYTICS
  // =====================================================

  const carbon = analytics.filter(
    (item) => item.metric_name === "Carbon Sequestration",
  );

  const biodiversity = analytics.filter(
    (item) => item.metric_name === "Biodiversity Index",
  );

  const treeCover = analytics.filter(
    (item) => item.metric_name === "Tree Cover",
  );

  const chartData = useMemo(() => {
    const dates = [
      ...new Set(analytics.map((item) => item.recorded_at)),
    ].sort();

    return {
      labels: dates.map((date) =>
        new Date(date).toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric",
        }),
      ),

      datasets: [
        {
          label: "Carbon sequestration",

          data: dates.map((date) => {
            const item = carbon.find((x) => x.recorded_at === date);

            return item?.metric_value ?? null;
          }),

          borderWidth: 2,
          tension: 0.3,
        },

        {
          label: "Biodiversity index",

          data: dates.map((date) => {
            const item = biodiversity.find((x) => x.recorded_at === date);

            return item?.metric_value ?? null;
          }),

          borderWidth: 2,
          tension: 0.3,
        },

        {
          label: "Tree cover",

          data: dates.map((date) => {
            const item = treeCover.find((x) => x.recorded_at === date);

            return item?.metric_value ?? null;
          }),

          borderWidth: 2,
          tension: 0.3,
        },
      ],
    };
  }, [analytics]);

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return <div className="dashboard-loading">Loading Darukaa.Earth...</div>;
  }

  // =====================================================
  // DASHBOARD
  // =====================================================

  return (
    <div className="dashboard">
      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">D</div>

          <div>
            <strong>Darukaa.Earth</strong>

            <span>Environmental data</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className="nav-item active"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
          >
            Overview
          </button>

          <button
            className="nav-item"
            onClick={() =>
              document.getElementById("projects")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            Projects
          </button>

          <button
            className="nav-item"
            onClick={() =>
              document.getElementById("sites")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            Sites
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="logout-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="dashboard-main">
        {/* HEADER */}

        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Overview</p>

            <h1>Environmental projects</h1>

            <p className="header-description">
              Monitor project sites and environmental indicators.
            </p>
          </div>

          <div className="header-actions">
            <button
              className="new-project-button"
              onClick={() => setShowProjectForm(true)}
            >
              + New project
            </button>

            <div className="header-user">
              <div className="user-avatar">L</div>

              <span>Lokesh</span>
            </div>
          </div>
        </header>

        {/* ERROR */}

        {error && <div className="dashboard-error">{error}</div>}

        {/* =================================================
            CREATE PROJECT FORM
        ================================================= */}

        {showProjectForm && (
          <section className="panel project-form-panel">
            <div className="panel-header">
              <div>
                <h2>Create a project</h2>

                <p>Add a project to start mapping environmental sites.</p>
              </div>

              <button
                className="close-button"
                onClick={() => setShowProjectForm(false)}
              >
                ×
              </button>
            </div>

            <form className="project-form" onSubmit={createProject}>
              <label>
                Project name
                <input
                  type="text"
                  name="name"
                  value={projectForm.name}
                  onChange={handleProjectChange}
                  placeholder="e.g. Western Ghats Restoration"
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  value={projectForm.description}
                  onChange={handleProjectChange}
                  placeholder="Brief description of the project"
                  rows="3"
                />
              </label>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowProjectForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create project"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* =================================================
            NO PROJECT
        ================================================= */}

        {projects.length === 0 ? (
          <section className="empty-dashboard">
            <div className="empty-icon">+</div>

            <h2>No projects yet</h2>

            <p>
              Create your first environmental project to start mapping sites and
              tracking indicators.
            </p>

            <button
              className="new-project-button"
              onClick={() => setShowProjectForm(true)}
            >
              Create your first project
            </button>
          </section>
        ) : (
          <>
            {/* =================================================
                STATISTICS
            ================================================= */}

            <section className="stats-grid">
              <Stat
                label="Projects"
                value={projects.length}
                description="Your projects"
              />

              <Stat
                label="Sites"
                value={sites.length}
                description="Mapped sites"
              />

              <Stat
                label="Total area"
                value={sites
                  .reduce((total, site) => total + Number(site.area || 0), 0)
                  .toFixed(2)}
                description="Hectares"
              />
            </section>

            {/* =================================================
                PROJECTS
            ================================================= */}

            <section id="projects" className="panel projects-section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Projects</p>

                  <h2>Your projects</h2>
                </div>

                <button
                  className="small-action"
                  onClick={() => setShowProjectForm(true)}
                >
                  + Add project
                </button>
              </div>

              <div className="project-list">
                {projects.map((project) => (
                  <div className="project-card" key={project.id}>
                    <div>
                      <strong>{project.name}</strong>

                      <p>{project.description || "No description provided."}</p>
                    </div>

                    <span>Project #{project.id}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* =================================================
                MAP + SITES
            ================================================= */}

            <section className="workspace">
              {/* MAP */}

              <div className="panel map-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Map</p>

                    <h2>Project sites</h2>

                    <p>Use the polygon tool to add a geographical site.</p>
                  </div>
                </div>

                <div ref={mapContainer} className="real-map">
                  {!MAPBOX_TOKEN && (
                    <div className="map-message">
                      Add your Mapbox token to frontend/.env
                    </div>
                  )}
                </div>
              </div>

              {/* SITES */}

              <div id="sites" className="panel sites-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Sites</p>

                    <h2>Mapped sites</h2>

                    <p>
                      {sites.length} site
                      {sites.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <button
                    className="small-action"
                    onClick={() => {
                      setShowSiteForm(true);

                      setError("");
                    }}
                  >
                    + Add site
                  </button>
                </div>

                {/* =================================================
                    SITE FORM
                ================================================= */}

                {showSiteForm && (
                  <div className="site-form">
                    <h3>Add site</h3>

                    <p>
                      Draw the boundary on the map, then enter the site details.
                    </p>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={startDrawing}
                    >
                      Draw boundary
                    </button>

                    <form onSubmit={createSite} className="project-form">
                      <label>
                        Site name
                        <input
                          type="text"
                          name="name"
                          value={siteForm.name}
                          onChange={handleSiteChange}
                          placeholder="e.g. Western Ghats Site 1"
                          required
                        />
                      </label>

                      <label>
                        Description
                        <textarea
                          name="description"
                          value={siteForm.description}
                          onChange={handleSiteChange}
                          placeholder="Brief description of the site"
                          rows="3"
                        />
                      </label>

                      <div className="site-drawing-status">
                        {draftGeometry
                          ? "Boundary selected."
                          : "No boundary selected yet."}
                      </div>

                      <div className="form-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={cancelSiteForm}
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          className="primary-button"
                          disabled={savingSite || !draftGeometry}
                        >
                          {savingSite ? "Saving..." : "Save site"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* SITE LIST */}

                <div className="site-list">
                  {sites.length === 0 ? (
                    <div className="empty-state">
                      No sites have been added to this project.
                    </div>
                  ) : (
                    sites.map((site) => (
                      <button
                        key={site.id}
                        className={`site-item ${
                          selectedSite?.id === site.id ? "selected" : ""
                        }`}
                        onClick={() => handleSiteSelect(site)}
                      >
                        <div className="site-item-top">
                          <strong>{site.name}</strong>

                          <span>{site.area ?? "—"} ha</span>
                        </div>

                        <p>
                          {site.description || "Environmental monitoring site"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* =================================================
                SELECTED SITE
            ================================================= */}

            {selectedSite && (
              <>
                <section className="panel site-details">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Selected site</p>

                      <h2>{selectedSite.name}</h2>

                      <p>
                        {selectedSite.description ||
                          "Environmental monitoring site"}
                      </p>
                    </div>

                    <div className="area-display">
                      <strong>{selectedSite.area ?? "—"}</strong>

                      <span>hectares</span>
                    </div>
                  </div>

                  <div className="metric-cards">
                    <Metric
                      title="Carbon sequestration"
                      value={
                        carbon.length
                          ? carbon[carbon.length - 1].metric_value
                          : "—"
                      }
                      unit="tCO₂e"
                    />

                    <Metric
                      title="Biodiversity index"
                      value={
                        biodiversity.length
                          ? biodiversity[biodiversity.length - 1].metric_value
                          : "—"
                      }
                      unit="index"
                    />

                    <Metric
                      title="Tree cover"
                      value={
                        treeCover.length
                          ? treeCover[treeCover.length - 1].metric_value
                          : "—"
                      }
                      unit="%"
                    />
                  </div>
                </section>

                {/* =================================================
                    CHART
                ================================================= */}

                <section className="panel chart-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Performance</p>

                      <h2>Environmental indicators</h2>

                      <p>Recorded performance over time.</p>
                    </div>
                  </div>

                  <div className="chart-container">
                    {analytics.length > 0 ? (
                      <Line
                        data={chartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,

                          plugins: {
                            legend: {
                              position: "bottom",
                            },
                          },
                        }}
                      />
                    ) : (
                      <div className="empty-state">No analytics available.</div>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// =====================================================
// STAT COMPONENT
// =====================================================

function Stat({ label, value, description }) {
  return (
    <div className="stat-card">
      <span>{label}</span>

      <strong>{value}</strong>

      <small>{description}</small>
    </div>
  );
}

// =====================================================
// METRIC COMPONENT
// =====================================================

function Metric({ title, value, unit }) {
  return (
    <div className="metric-card">
      <span>{title}</span>

      <strong>{value}</strong>

      <small>{unit}</small>
    </div>
  );
}

export default Dashboard;
