"use strict"

let instance;
const Desdinova3DEngineLight = function () {
    // Main version
    const engineVersion = `${'1.5.'}${THREE.REVISION.toString()}`;
    this.animationMixers = [];
    const clock = new THREE.Clock();

    // Setup
    this.Setup = function (window, domElement, params = {}) {
        const defaultParams = {
            logging: false,
            pixelRatio: 1.0,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            autoClear: false,
            clearColor: 0x222222,
            powerPreference: 'default',
            outputEncoding: THREE.LinearEncoding,
            gammaOutput: true,
            physicallyCorrectLights: false,
            shadowMap: true,
            shadowMapType: THREE.PCFSoftShadowMap,
            toneMapping: THREE.NoToneMapping,
            toneMappingExposure: 1,
            logarithmicDepthBuffer: false,  //May impact on rendere's antialias enabled
            staticRendering: false,
            precision: "highp"
        };
        // Init page element
        this.window = window;
        // Configuration
        this.engineConfiguration = {
            ...defaultParams,
            ...params,
        };

        //Version
        if (this.engineConfiguration.logging) { console.log('Engine version [Light]', engineVersion); }

        // Load manager
        THREE.DefaultLoadingManager.onStart = function () {
            if (this.engineConfiguration.logging) { console.log('LoadingManager', 'Loading Start'); }
            if (this.OnLoadStart) {
                this.OnLoadStart();
            }
            this.DispatchMessage({
                type: 'OnLoadStart',
                value: true,
                payload: null,
            });
        }.bind(this);

        THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
            //this.engineLog('LoadingManager', `Loading file '${url} - Loaded ${itemsLoaded} / ${itemsTotal} files.`);
            if (this.OnLoadProgress) {
                this.OnLoadProgress(url, itemsLoaded, itemsTotal);
            }
            this.DispatchMessage({
                type: 'OnLoadProgress',
                value: true,
                payload: {
                    percent: Math.round((itemsLoaded / itemsTotal) * 100),
                },
            });
        }.bind(this);

        THREE.DefaultLoadingManager.onLoad = function () {
            //this.engineLog('LoadingManager', 'Loading Complete');
            //See: https://discourse.threejs.org/t/performant-soft-shadows-three-js/27777/12
            if (this.engineConfiguration.logging) { console.log('LoadingManager', 'Loading End'); }
            if (this.OnLoadFinish) {
                this.OnLoadFinish();
            }
            this.DispatchMessage({
                type: 'OnLoadFinish',
                value: false,
                payload: null,
            });
        }.bind(this);

        THREE.DefaultLoadingManager.onError = function (error) {
            //this.engineLog('LoadingManager', `Loading Error -> ${error}`);

            if (this.OnLoadError) {
                this.OnLoadError(error);
            }
            this.DispatchMessage({
                type: 'OnLoadError',
                value: false,
                payload: {
                    message: error,
                },
            });
        }.bind(this);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.engineConfiguration.antialias,
            alpha: this.engineConfiguration.alpha,
            precision: this.engineConfiguration.precision,
            preserveDrawingBuffer: this.engineConfiguration.preserveDrawingBuffer,
            logarithmicDepthBuffer: this.engineConfiguration.logarithmicDepthBuffer  //https://stackoverflow.com/questions/37858464/material-shines-through-when-zooming-out-three-js-r78
        });
        this.renderer.setClearColor(this.engineConfiguration.clearColor, 1.0);

        // Container (the div where <canvas> stay)
        this.container = domElement;
        this.container.appendChild(this.renderer.domElement);        // Add the automatically created <canvas> element to the page

        // Pixel ratio, if defined (should be down for mobile devices)
        this.renderer.setPixelRatio(this.engineConfiguration.pixelRatio);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);

        //Shadows
        this.renderer.shadowMap.enabled = this.engineConfiguration.shadowMap;
        this.renderer.shadowMap.type = this.engineConfiguration.shadowMapType;

        // Allow render overlay on top of sprited sphere
        this.renderer.autoClear = this.engineConfiguration.autoClear;

        // Phisically Based Scene light (https://www.fabrizioduroni.it/2017/05/13/first-threejs-scene.html)
        this.renderer.physicallyCorrectLights = this.engineConfiguration.physicallyCorrectLights;

        //Power performance
        this.renderer.powerPreference = this.engineConfiguration.powerPreference;

        // Encoding
        this.renderer.outputEncoding = this.engineConfiguration.outputEncoding;     //https://threejs.org/docs/#manual/en/introduction/Color-management

        // Shadow map
        this.renderer.shadowMap.enabled = this.engineConfiguration.shadowMap;
        this.renderer.shadowMap.type = this.engineConfiguration.shadowMapType;

        //Static rendering (disable autoupdate render of the shadowmap)
        if (this.engineConfiguration.staticRendering) {
            setTimeout(() => { this.renderer.shadowMap.autoUpdate = false; }, 500);
        }

        // Tone mapping
        this.renderer.toneMapping = this.engineConfiguration.toneMapping;
        this.renderer.toneMappingExposure = Math.pow(this.engineConfiguration.toneMappingExposure, 5.0);

        //Composer
        try {

            // Main render target
            this.mainRenderTarget = new THREE.WebGLRenderTarget(this.container.clientWidth, this.container.clientHeight,
                {
                    stencilBuffer: true,    //For MaskPass usage only                   
                    //samples: 4   //No FXAA pass needed if enabled
                });
            this.currentComposer = new THREE.EffectComposer(this.renderer, this.mainRenderTarget);
        }
        catch
        {
            if (this.engineConfiguration.logging) { console.log("No EffectComposer defined. Add component first" ); }
        }

        // Clock
        this.clock = new THREE.Clock(true);

        // Resize listerner
        this.OnWindowResize = function () {
            // set the aspect ratio to match the new browser window aspect ratio
            this.currentCamera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.currentCamera.updateProjectionMatrix();
            // update the size of the renderer AND the canvas
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            if (this.currentComposer) {
                this.currentComposer.setSize(this.container.clientWidth, this.container.clientHeight);
            }
        }.bind(this);
        this.window.addEventListener('resize', this.OnWindowResize, false);
        setTimeout(this.OnWindowResize, 100);

        //Mouse
        this.container.addEventListener('mousedown', this.onMouseDown);
        this.window.addEventListener("keydown", this.onKeyDown);

        //Listeners
        this.window.addEventListener('message', this.onCommunicationMessage, false);


    }.bind(this);



    this.AnimationLoop = function () {

        //pre render
        if (this.OnPreRender) {
            this.OnPreRender();
        }

        //Animations        
        requestAnimationFrame(this.AnimationLoop);

        //Mixers
        if (this.animationMixers) {
            if (this.animationMixers.length > 0) {
                for (var i = 0; i < this.animationMixers.length; i++) {
                    this.animationMixers[i].update(this.clock.getDelta());
                }
            }
        }

        // Render pass
        if (this.currentComposer && this.currentComposer.passes.length > 0) {
            this.currentComposer.render();
            //Render more
            if (this.OnRender) {
                this.OnRender();
            }
        }
        else {
            this.renderer.clear();
            this.renderer.render(this.currentScene, this.currentCamera);
            //Render more
            if (this.OnRender) {
                this.OnRender();
            }
            // Render ortho
            this.renderer.clearDepth();
        }

        //Post render
        if (this.OnPostRender) {
            this.OnPostRender();
        }

        // Controls
        if (this.currentControl) {
            this.currentControl.update();
        }

    }.bind(this);



    this.onMouseDown = function (event) {

        // Calculate mouse position in normalized device coordinates (-1 to +1) for both components
        this.mouse = new THREE.Vector2();
        this.mouse.x = +(event.offsetX / this.renderer.domElement.width) * 2 - 1;
        this.mouse.y = -(event.offsetY / this.renderer.domElement.height) * 2 + 1;
        this.mouse.z = 0.99;

        // Reycast intersect (on all obejcts in scene)
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.mouse.clone(), this.currentCamera);
        let intersects = raycaster.intersectObjects(this.currentScene.children, true);

        // Set new current object
        if (intersects !== undefined && intersects.length > 0) {
            if (this.OnObjectClick) {
                this.OnObjectClick(intersects, event);
            }
            this.DispatchMessage({
                type: 'OnObjectClick',
                value: false,
                payload: {
                    intersects: intersects,
                    event: event
                },
            });
        }
    }.bind(this);


    this.onKeyDown = function (event) {
        if (this.OnKeyboardDown) {
            this.OnKeyboardDown(event);
        }
    }.bind(this);


    this.onCommunicationMessage = function (msg) {
        var message = msg.data;
        var origin = msg.origin;  //Check the origin (not only *)
        var source = msg.source;
        //var messageObject = JSON.parse(message);

        if (this.OnMessage) {
            this.OnMessage(msg);
        }

        if (this.engineConfiguration.logging) { /*console.log(messageObject);*/ }
    }.bind(this);



    this.CreateBox = function (name, width, height, depth, widthSegments, heightSegments, depthSegments, color, position, rotation, castShadow, receiveShadow, renderOrder, userData) {

        let geometry = new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments);

        let material = new THREE.MeshPhongMaterial({ color: 0xffffff });
        material.color.setHex(color);

        let cube = new THREE.Mesh(geometry, material);
        cube.name = name;
        cube.castShadow = castShadow;
        cube.receiveShadow = receiveShadow;
        cube.position.copy(position);
        cube.rotation.x = THREE.MathUtils.degToRad(rotation.x);
        cube.rotation.y = THREE.MathUtils.degToRad(rotation.y);
        cube.rotation.z = THREE.MathUtils.degToRad(rotation.z);
        cube.renderOrder = renderOrder || 0;
        cube.userData = userData;
        cube.visible = true;

        return cube;
    }.bind(this);


    this.CreateSphere = function (name, radius, widthSegments, heightSegments, color, position, rotation, castShadow, receiveShadow, renderOrder, userData) {

        let geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments );

        //let material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        let material = new THREE.MeshBasicMaterial({ color: 0xff0000 });    //Not affected by the light
        material.color.setHex(color);

        let sphere = new THREE.Mesh(geometry, material);
        sphere.name = name;
        sphere.castShadow = castShadow;
        sphere.receiveShadow = receiveShadow;
        sphere.position.copy(position);
        sphere.rotation.x = THREE.MathUtils.degToRad(rotation.x);
        sphere.rotation.y = THREE.MathUtils.degToRad(rotation.y);
        sphere.rotation.z = THREE.MathUtils.degToRad(rotation.z);
        sphere.renderOrder = renderOrder || 0;
        sphere.userData = userData;
        sphere.visible = true;

        return sphere;
    }.bind(this);



    this.CreateSprite = function (texturePath, position, scale, userData) {

        const map = new THREE.TextureLoader().load(texturePath);
        const material = new THREE.SpriteMaterial({ map: map });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(position.x, position.y, position.z);
        sprite.scale.set(scale.x, scale.y, scale.z);
        sprite.userData = userData;

        return sprite;
    }.bind(this);
    




    this.RemoveObject3D = function (object) {

        if (!(object instanceof THREE.Object3D)) {
            return false;
        }

        //Traverse children
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    this.RemoveMaterial(child.material);
                }
            }
        });

        //remove obejct from scene
        if (this.currentScene) {
            this.currentScene.remove(object);
        }

        return true;
    };


    this.RemoveMaterial = function (material) {
        if (material) {
            //The material obejct can be a single material or an array of material (multi-materials object)
            if (material instanceof Array) {
                for (const mat in material) {
                    //Dispose textures
                    if (mat.map) map.map.dispose();
                    if (mat.bumpMap) map.bumpMap.dispose();
                    if (mat.specularMap) map.specularMap.dispose();
                    if (mat.normalMap) map.normalMap.dispose();
                    if (mat.displacementMap) map.displacementMap.dispose();
                    if (mat.aoMap) map.aoMap.dispose();
                    if (mat.envMap) map.envMap.dispose();
                    if (mat.roughnessMap) map.roughnessMap.dispose();
                    if (mat.metalnessMap) map.metalnessMap.dispose();
                    if (mat.alphaMap) map.alphaMap.dispose();
                }
                //dispose materials
                material.forEach(material => material.dispose());
                return true;
            } else {
                //Dispose textures
                if (material.map) material.map.dispose();
                if (material.bumpMap) material.bumpMap.dispose();
                if (material.specularMap) material.specularMap.dispose();
                if (material.normalMap) material.normalMap.dispose();
                if (material.displacementMap) material.displacementMap.dispose();
                if (material.aoMap) material.aoMap.dispose();
                if (material.envMap) material.envMap.dispose();
                if (material.roughnessMap) material.roughnessMap.dispose();
                if (material.metalnessMap) material.metalnessMap.dispose();
                if (material.alphaMap) material.alphaMap.dispose();
                // dispose material
                material.dispose();
                return true;
            }
        }
        return false;
    }




    this.ToggleObjectMaterialWireframe = function (object) {
        object.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                if (child.material.wireframe) {
                    child.material.wireframe = false;
                }
                else { child.material.wireframe = true; }
                child.material.needsUpdate = true;
            }
        });
    };



    this.LoadTexture = function (path, callback_success) {

        var loader = new THREE.TextureLoader();
        loader.load(path, function (texture) {
            callback_success(texture);            
        });

    }.bind(this);



    this.LoadModel = function (path, name, position, rotation, scale, notes, callback_success) {

        let scope = this;
        //Seleziona il tipo di loader in base alla estensione del file
        let loader = null;
        let extension = path.split('.').pop();
        if (extension === "fbx") {
            loader = new THREE.FBXLoader(); //FBX
        }
        else if (extension === "gltf" || extension === "glb") {
            loader = new THREE.GLTFLoader(); //Gltf
        }
        else {
            loader = new THREE.OBJLoader(); //Default OBJ
        }

        // load a resource
        loader.load(
            // resource URL
            path,
            // called when resource is loaded
            function (object) {

                //Get animations (for gltf is from base obejct, not .scene one)
                let animations = object.animations;

                //gltf/glb ha una gerarchia differente
                if (extension === "gltf" || extension === "glb") {                    
                    object = object.scene;
                }

                object.name = name;
                object.position.copy(new THREE.Vector3(position.x, position.y, position.z));

                object.rotation.x = THREE.MathUtils.degToRad(rotation.x);
                object.rotation.y = THREE.MathUtils.degToRad(rotation.y);
                object.rotation.z = THREE.MathUtils.degToRad(rotation.z);

                object.scale.copy(new THREE.Vector3(scale.x, scale.y, scale.z));

                object.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        //if (child.material) child.material.metalness = 0;
                    }
                })

                //Skeleton
                //let skeleton = new THREE.SkeletonHelper(object);
                //if (skeleton) {
                //    skeleton.visible = true;
                //    scope.currentScene.add(skeleton);
                //}

                // Animations
                object.mixer = new THREE.AnimationMixer(object);
                scope.animationMixers.push(object.mixer);

                //User data
                object.userData = { notes: notes, animations: animations };

                if (typeof callback_success === 'function') {
                    callback_success(object);
                }
            },
            // called when loading is in progresses
            function (xhr) {
                if (scope.engineConfiguration.logging) { console.log(path + ": " + (xhr.loaded / xhr.total * 100) + '% loaded'); }
            },
            // called when loading has errors
            function (error) {
                if (scope.engineConfiguration.logging) { console.log('Error loading "' + path + '": ' + error); }
            }
        );
    }.bind(this);



    this.GetModelAnimations = function (model, animationID) {
        return model.userData.animations;                    
    }.bind(this);

    this.GetModelAnimation = function (model, animationID) {
        if (model.userData.animations) {
            if (model.userData.animations.length > 0) {
                let animation;
                if (isNaN(animationID)) {
                    animation = THREE.AnimationClip.findByName(model.userData.animations, animationID); //From string
                }
                else {
                    animation = model.userData.animations[parseInt(animationID)];   //From number
                }
                return animation;
            }
        }
        return null;
    }.bind(this);

    this.PlayModelAnimation = function(model, animationID) {
        let animation = this.GetModelAnimation(model, animationID);
        if (animation) {
            var action = model.mixer.clipAction(animation);
            if (action) {
                action.play();
            }
        }           
    }.bind(this);

    this.StopModelAnimation = function (model, animationID) {
        let animation = this.GetModelAnimation(model, animationID);
        if (animation) {
            var action = model.mixer.clipAction(animation);
            if (action) {
                action.stop();
            }
        }
    }.bind(this);

    this.PauseModelAnimation = function (model, animationID) {
        let animation = this.GetModelAnimation(model, animationID);
        if (animation) {
            var action = model.mixer.clipAction(animation);
            if (action) {
                action.paused = !action.paused;
            }
        }
    }.bind(this);


    this.SetModelEnvironmentMap = function (model, path, intensity, callback_success, callback_error) {
        let loader;
        if (path.includes(".hdr")) { loader = new THREE.RGBELoader(); }
        else { loader = new THREE.TextureLoader(); }

        if (loader) {
            loader.load(path, function (texture) {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                model.traverse(function (obj) {
                    if (obj instanceof THREE.Mesh) {
                        obj.material.envMap = texture;
                        obj.material.envMap.encoding = THREE.sRGBEncoding;
                        if (intensity) {
                            obj.material.envMapIntensity = intensity;
                        }
                    }
                });
                if (callback_success) {
                    callback_success(texture);
                }
            }, null, function (err) {
                if (callback_error) {
                    callback_error(err);
                }
            });
        }
    }.bind(this);

    //Screenshot
    this.TakeScreenshot = function (scene, camera) {
        var w = window.open('', '');
        w.document.title = "Screenshot";
        var img = new Image();
        // Without 'preserveDrawingBuffer' set to true, we must render now
        this.renderer.render(scene, camera);
        this.renderer.clearDepth();
        img.src = this.renderer.domElement.toDataURL();
        w.document.body.appendChild(img);
    }.bind(this);

    //Wireframe
    this.ToggleObjectMaterialWireframe = function (object) {
        if (object) {
            object.traverse(function (child) {
                if (child instanceof THREE.Mesh) {
                    if (child.material.wireframe) {
                        child.material.wireframe = false;
                    }
                    else { child.material.wireframe = true; }
                }
            });
        }
    };

    // dispatch a message outside engine to interact with external interface
    this.DispatchMessage = function(payload) {
        const event = new CustomEvent('3DEngineEvent', {
            detail: payload,
        });
        document.body.dispatchEvent(event);
    }.bind(this);
};


// Singleton (not .prototype)
Desdinova3DEngineLight.GetInstance = function () {
    const canvas = document.createElement('canvas');
    const result = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    if (result) {
        if (instance == null) {
            instance = new Desdinova3DEngineLight(); // Return unique instance
        }
        return instance;
    }
    return null;
};




